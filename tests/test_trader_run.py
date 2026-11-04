"""봇 하루 실행기(trader/run.py)를 가상 시계·가상 계좌·가상 우편함으로 여러 날 돌려 본다. 실제 시세·주문·네트워크 없음."""
import json, tempfile, unittest
from datetime import datetime, date, timedelta
from pathlib import Path

from trader.broker import DryRunBroker, Quote
from trader.feed import build_feed, add_feed_signals
from trader.replay import load_input, replay
from trader.rules import Settings
from trader.run import Config, Day, KST, FEED, reconcile
from trader.book import load
from trader.sync import STATE

FIXTURE = Path(__file__).parent / 'fixtures' / 'trader-synthetic.json'
S = Settings()


def business_days(start: date, n: int):
    out, d = [], start
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d.isoformat())
        d += timedelta(days=1)
    return out


def synthetic():
    data = load_input(FIXTURE)
    data['sessions'] = business_days(date(2026, 3, 2), len(data['sessions']))  # 평일만(실행기는 주말에 쉼)
    return data


def upto(data, i):
    """i번째 거래일 장 마감까지 알 수 있는 자료만 남긴 입력(공급 파일은 그날 저녁에 생김)."""
    return dict(data, sessions=data['sessions'][:i + 1],
                stocks=[dict(c, signals=[x for x in c['signals'] if x['index'] <= i], prices=c['prices'][:i + 1],
                             sells=[x for x in (c.get('sells') or []) if x[0] <= i]) for c in data['stocks']])


class FakeClock:
    def __init__(self, t):
        self.t = t

    def now(self):
        return self.t

    def sleep(self, seconds):
        self.t += timedelta(seconds=max(seconds, 1))


class Market(DryRunBroker):
    """그날 일봉으로 시간대별 가격을 낸다: 09:00 전 전일 종가, 09:00~09:30 시가, ~12:00 저가, ~15:20 고가, 그 뒤 종가."""
    def bind(self, data, clock):
        self.data, self.clock, self.by = data, clock, {c['code']: c for c in data['stocks']}
        return self

    def quote(self, code):
        days = self.data['sessions']
        today = self.clock.now().date().isoformat()
        c = self.by[code]
        if today not in days:
            return Quote(code, None)
        i = days.index(today)
        bar, prev = c['prices'][i], (c['prices'][i - 1] if i else None)
        pc = prev and prev['close']
        t = self.clock.now().time()
        if t < datetime(2000, 1, 1, 9, 0).time():
            return Quote(code, pc, None, pc)
        price = bar['open'] if t < datetime(2000, 1, 1, 9, 30).time() else bar['low'] if t < datetime(2000, 1, 1, 12).time() else bar['high'] if t < datetime(2000, 1, 1, 15, 20).time() else bar['close']
        return Quote(code, price, bar['open'], pc)


class Mailbox:
    def __init__(self, data, clock):
        self.data, self.clock, self.files, self.stop = data, clock, {}, False

    def get_json(self, path):
        if path == FEED:
            now, days = self.clock.now(), self.data['sessions']
            today = now.date().isoformat()
            done = [k for k, d in enumerate(days) if d < today or (d == today and now.time() >= datetime(2000, 1, 1, 16, 40).time())]
            return (build_feed(upto(self.data, done[-1])), 'sha') if done else (None, None)
        return (self.files.get(path), 'sha') if path in self.files else (None, None)

    def put_json(self, path, obj, message):
        self.files[path] = json.loads(json.dumps(obj))

    def remote_stopped(self):
        return self.stop


def run_days(data, *, initial=20_000_000, start='08:40', skip=(), stop_on=(), cfg_over=None, state=None):
    state = Path(state or tempfile.mkdtemp())
    cfg = Config(mode='dry-run', initial_cash=initial, daily_max_buy=1e12, **(cfg_over or {}))
    clock = FakeClock(datetime(2026, 3, 2, 8, 40, tzinfo=KST))
    broker = Market(initial).bind(data, clock)
    box = Mailbox(data, clock)
    results = []
    for k, day in enumerate(data['sessions']):
        if k in skip:
            continue  # PC가 꺼져 있던 날
        h, m = (int(x) for x in (start(k) if callable(start) else start).split(':'))
        clock.t = datetime.fromisoformat(day).replace(hour=h, minute=m, tzinfo=KST)
        box.stop = k in stop_on
        results.append(Day(cfg, state, broker, box, clock, S).run())
    return load(state / 'book.json'), broker, box, results


def keyed(book):
    return {f"{t['code']}:{t['signal_date']}": t for t in book['trades'] + list(book['positions'].values()) + list(book['halted'].values())}


class RunnerTests(unittest.TestCase):
    def test_days_match_the_replay(self):
        data = synthetic()
        for initial in (20_000_000, 8_000_000):
            book, broker, box, results = run_days(data, initial=initial)
            want = {f"{t['code']}:{t['signal_date']}": t for t in replay(data, S, initial=initial)['trades'] if t['entry_date']}
            got = keyed(book)
            self.assertEqual(set(got), set(want), initial)
            for k, t in want.items():
                self.assertEqual((got[k]['entry_date'], got[k]['shares']), (t['entry_date'], t['shares']), k)
                if t['status'] in ('take', 'stop', 'flow'):
                    self.assertEqual((got[k]['status'], got[k]['exit_date']), (t['status'], t['exit_date']), k)
                    self.assertAlmostEqual(got[k]['pnl'], t['pnl'], places=2)
            self.assertEqual(book['feed_applied'], data['sessions'][-1])
            st = box.files[STATE]
            self.assertEqual(st['mode'], 'dry-run'); self.assertEqual(len(st['balance']['positions']), len(book['positions']))
            self.assertTrue(all(r.get('feed_applied') for r in results))

    def test_late_start_skips_buys_until_the_next_open(self):
        data = synthetic()
        normal, *_ = run_days(data)
        late, *_ = run_days(data, start=lambda k: '10:05' if k == 1 else '08:40')
        first_buy = min(t['entry_date'] for t in keyed(normal).values())
        self.assertEqual(first_buy, data['sessions'][1])
        self.assertTrue(all(t['entry_date'] > data['sessions'][1] for t in keyed(late).values()))
        self.assertTrue(any(o['kind'] == 'late' for o in late['orders']))

    def test_pc_off_for_a_day_catches_up_next_morning(self):
        data = synthetic()
        book, broker, box, results = run_days(data, skip={2})
        self.assertEqual(book['feed_applied'], data['sessions'][-1])
        self.assertIn(data['sessions'][2], [o['date'] for o in book['orders'] if o['kind'] == 'feed'],
                      "day 2's feed is applied on the morning of day 3")
        flow = [t for t in book['trades'] if t['status'] == 'flow']
        self.assertTrue(flow, 'the pension sell seen while the PC was off still triggers the open sale')

    def test_emergency_stop_places_no_orders(self):
        data = synthetic()
        book, broker, box, results = run_days(data, stop_on=set(range(len(data['sessions']))))
        self.assertEqual(broker.fills, []); self.assertEqual(book['positions'], {})
        self.assertTrue(box.files[STATE]['stopped'])

    def test_mismatch_with_the_account_stops_new_buys(self):
        data = synthetic()
        with tempfile.TemporaryDirectory() as d:
            run_days(data, state=d)  # normal run leaves positions
            book = load(Path(d) / 'book.json')
            broker = DryRunBroker(1)
            self.assertTrue(reconcile(book, broker), 'an empty account differs from a book with positions')

    def test_stale_signals_are_not_bought(self):
        data = synthetic()
        feed = build_feed(upto(data, 12))
        book = load('/nonexistent')
        added = add_feed_signals(book, feed, stale_after=2)
        self.assertTrue(all(feed['sessions'].index(x['signal_date']) >= len(feed['sessions']) - 3 for x in added))
        self.assertTrue(any(o['kind'] == 'skip' for o in book['orders']))

    def test_feed_takes_sells_from_the_collected_input_by_date(self):
        data = synthetic()
        no_sells = dict(data, stocks=[dict(c, sells=[]) for c in data['stocks']])
        feed = build_feed(no_sells, days=len(data['sessions']), sells_from=data)
        want = sorted((c['code'], data['sessions'][i]) for c in data['stocks'] for i, _ in (c.get('sells') or []))
        self.assertEqual(sorted((x['code'], x['date']) for x in feed['sells']), want)
        self.assertEqual(build_feed(no_sells)['sells'], [])

    def test_config_validation(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'c.json'
            p.write_text(json.dumps(dict(mode='shadow', daily_max_buy=5e6)))
            self.assertEqual(Config.load(p).mode, 'shadow')
            for bad in [dict(mode='yolo'), dict(nope=1), dict(poll_seconds=1)]:
                p.write_text(json.dumps(bad))
                with self.assertRaises(ValueError):
                    Config.load(p)


if __name__ == '__main__':
    unittest.main()
