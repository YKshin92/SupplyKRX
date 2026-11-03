import json, os, tempfile, unittest
from pathlib import Path

from trader.rules import Settings, size_buy, exit_on_bar, exit_on_price, exit_at_open, open_gap_problem, queue_order, flow_exit_due
from trader.replay import replay, load_input
from trader.book import load, save, add_signals
from trader.broker import DryRunBroker, Quote, PlugBroker, LiveGuardError, check_target, order_payload
from trader.bot import Risk, at_open, on_price, after_close

FIXTURE = Path(__file__).parent / 'fixtures' / 'trader-synthetic.json'
S = Settings()


class RuleTests(unittest.TestCase):
    def test_sizing_full_partial_and_wait(self):
        shares, cost, why = size_buy(10_000, 50_000_000, 20_000_000, S)  # 25% of 2천만 = 500만
        self.assertEqual(shares, 499); self.assertIsNone(why); self.assertAlmostEqual(cost, 499 * 10_000 * 1.00015)
        shares, cost, _ = size_buy(10_000, 4_000_000, 20_000_000, S)     # 현금 부족 · 300만 이상이면 남은 현금만큼
        self.assertEqual(shares, 399)
        self.assertEqual(size_buy(10_000, 2_000_000, 20_000_000, S)[0], 0)  # 최소 금액 미만은 대기
        self.assertEqual(size_buy(10_000, 9_000_000, 4_000_000, S)[0], 299)  # 목표 100만 < 최소 300만 → 최소 금액만큼

    def test_exit_priority(self):
        self.assertEqual(exit_on_bar(10_000, dict(open=10_000, high=13_500, low=8_900, close=10_000), False, S)[:2], ('stop', 9_000))
        self.assertEqual(exit_on_bar(10_000, dict(open=8_500, high=9_000, low=8_000, close=8_800), False, S)[:2], ('stop', 8_500))
        self.assertEqual(exit_on_bar(10_000, dict(open=13_100, high=13_500, low=13_000, close=13_200), False, S)[:2], ('take', 13_100))
        self.assertEqual(exit_on_bar(10_000, dict(open=12_000, high=12_500, low=11_000, close=12_000), True, S)[:2], ('flow', 12_000))
        self.assertIsNone(exit_on_bar(10_000, dict(open=10_000, high=12_900, low=9_100, close=10_500), False, S))
        self.assertEqual(exit_on_price(10_000, 9_000, S)[0], 'stop'); self.assertEqual(exit_on_price(10_000, 13_000, S)[0], 'take')
        self.assertIsNone(exit_on_price(10_000, 9_001, S)); self.assertIsNone(exit_at_open(10_000, 9_001, False, S))

    def test_queue_gap_and_flow(self):
        q = queue_order([dict(code='2', score=50, signal_date='2026-01-02'), dict(code='1', score=None, signal_date='2026-01-01'),
                         dict(code='3', score=50, signal_date='2026-01-01')])
        self.assertEqual([t['code'] for t in q], ['3', '2', '1'])
        self.assertEqual(open_gap_problem(13_600, 10_000, S), '시가 단절'); self.assertIsNone(open_gap_problem(13_400, 10_000, S))
        self.assertTrue(flow_exit_due(dict(signal_net=5e8), 5.1e8, S)); self.assertFalse(flow_exit_due(dict(signal_net=5e8), 5e8, S))
        self.assertFalse(flow_exit_due(dict(signal_net=5e8), 9e8, Settings(flow_exit=False)))


class GuardTests(unittest.TestCase):
    def test_paper_only_unless_both_live_switches(self):
        check_target('paper', 'https://moapi.nhplug.com:8443', '123', '03')
        for args in [('paper', 'https://api.nhplug.com:8443', '123', '03'), ('paper', 'https://moapi.nhplug.com:8443', '123', '01'),
                     ('live', 'https://api.nhplug.com:8443', '123', '01'), ('live', 'https://moapi.nhplug.com:8443', '123', '01'),
                     ('live', 'https://api.nhplug.com:8443', '123', '03'), ('other', 'https://moapi.nhplug.com:8443', '123', '03')]:
            with self.assertRaises(LiveGuardError, msg=args):
                check_target(*args, env={})
        with self.assertRaises(LiveGuardError):
            check_target('live', 'https://api.nhplug.com:8443', '123', '01', env={'TRADER_LIVE_ACCOUNT': '999'})
        check_target('live', 'https://api.nhplug.com:8443', '123', '01', env={'TRADER_LIVE_ACCOUNT': '123'})

    def test_order_payload_and_no_call_when_guard_fails(self):
        body = order_payload('123', '005930', 10)
        self.assertEqual((body['nmn_pr_tp_cd'], body['orr_qty'], body['iem_cd']), ('05', 10, '005930'))
        self.assertEqual(order_payload('123', '005930', 1, 70000)['orr_pr'], 70000)
        for bad in [('123', '5930', 1), ('123', '005930', 0), ('123', '005930', 1.5)]:
            with self.assertRaises(ValueError):
                order_payload(*bad)
        calls = []
        with self.assertRaises(LiveGuardError):
            PlugBroker(mode='paper', account='1', account_type='03', base_url='https://api.nhplug.com:8443', call=lambda *a: calls.append(a))
        self.assertEqual(calls, [])
        b = PlugBroker(mode='paper', account='1', account_type='03', base_url='https://moapi.nhplug.com:8443', call=lambda p, body: calls.append((p, body)) or {})
        b.buy('005930', 3, reference=70000)
        self.assertEqual(calls[0][0], '/krstock/order/v1/cashBuy'); self.assertEqual(calls[0][1]['orr_qty'], 3)


def drive_bot(data, initial=20_000_000, risk=Risk(daily_max_buy=1e12)):
    """봇의 하루 함수들을 가상 계좌로 과거 일봉에 돌린다: 시가 → 장중(저가 먼저, 고가 다음 = 손절 우선) → 종가·연기금 순매도 → 새 신호."""
    days, stocks = data['sessions'], {c['code']: c for c in data['stocks']}
    sells = {c['code']: dict((i, v) for i, v in (c.get('sells') or [])) for c in data['stocks']}
    broker, book = DryRunBroker(initial), load('/nonexistent/book.json')
    for i, day in enumerate(days):
        broker.quotes = {code: Quote(code, (c['prices'][i] or {}).get('open'), (c['prices'][i] or {}).get('open'), (c['prices'][i - 1] or {}).get('close') if i else None)
                         for code, c in stocks.items()}
        at_open(book, broker, day, S, risk)
        for code in list(book['positions']):
            bar = stocks[code]['prices'][i]
            for price in (bar['low'], bar['high']):
                on_price(book, broker, day, code, price, S, risk)
        after_close(book, broker, day, {c: stocks[c]['prices'][i]['close'] for c in book['positions']}, {c: v.get(i) for c, v in sells.items()}, S)
        add_signals(book, data, since=day, until=day)
    return book, broker


class BotReplayParityTests(unittest.TestCase):
    """봇의 실제 하루 흐름(시가·장중 가격·마감)이 일봉 리플레이(= 사이트 시뮬레이션과 일치 확인됨)와 같은 거래를 만드는지."""
    def test_synthetic_days_match_replay(self):
        data = load_input(FIXTURE)
        for initial in (20_000_000, 8_000_000):
            book, broker = drive_bot(data, initial)
            want = {f"{t['code']}:{t['signal_date']}": t for t in replay(data, S, initial=initial)['trades'] if t['entry_date']}
            got = {f"{t['code']}:{t['signal_date']}": t for t in book['trades'] + list(book['positions'].values()) + list(book['halted'].values())}
            self.assertEqual(set(got), set(want), initial)
            for k, t in want.items():
                g = got[k]
                self.assertEqual((g['entry_date'], g['shares']), (t['entry_date'], t['shares']), k)
                self.assertAlmostEqual(g['invested'], t['invested'], places=4)
                if t['status'] in ('take', 'stop', 'flow'):
                    self.assertEqual((g['status'], g['exit_date']), (t['status'], t['exit_date']), k)
                    self.assertAlmostEqual(g['pnl'], t['pnl'], places=2, msg=k)
                elif t['status'] == 'unresolved':
                    self.assertIn(k.split(':')[0], book['halted'])
                else:
                    self.assertIn(k.split(':')[0], book['positions'])
            statuses = {t['status'] for t in book['trades']}
            self.assertTrue({'flow', 'stop', 'take'} <= statuses or initial != 20_000_000, statuses)

    def test_daily_cap_and_emergency_stop(self):
        data = load_input(FIXTURE)
        book, broker = drive_bot(data, risk=Risk(daily_max_buy=6_000_000))
        days = {}
        for o in book['orders']:
            if o['kind'] == 'buy':
                days[o['date']] = days.get(o['date'], 0) + o['amount']
        self.assertTrue(days and max(days.values()) <= 6_000_000, days)
        book, broker = drive_bot(data, risk=Risk(daily_max_buy=1e12, stopped=True))
        self.assertEqual(broker.fills, []); self.assertEqual(book['positions'], {})

    def test_book_round_trip(self):
        with tempfile.TemporaryDirectory() as d:
            book, _ = drive_bot(load_input(FIXTURE))
            save(book, Path(d) / 'b' / 'book.json')
            self.assertEqual(load(Path(d) / 'b' / 'book.json'), json.loads(json.dumps(book)))


if __name__ == '__main__':
    unittest.main()
