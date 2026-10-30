import unittest
from collector.signal_lab import co_buy_signals, barrier, evaluate, summarize, wilson, integrated_tracking, score_bands


def bar(o, h, l, c, v=100):
    return dict(open=o, high=h, low=l, close=c, volume=v)


class SignalLabTests(unittest.TestCase):
    def setUp(self):
        self.days = [f'd{i:02}' for i in range(30)]
        self.pos = {d: i for i, d in enumerate(self.days)}

    def test_entry_next_open_and_take_before_stop(self):
        p = {d: bar(100, 101, 99, 100) for d in self.days}
        p['d03'] = bar(100, 131, 99, 120)  # +30% touched on the 3rd held session
        r = evaluate(p, self.days, self.pos, 'd00', {})
        self.assertEqual((r['entry_date'], r['entry_price']), ('d01', 100))
        self.assertEqual(r['rules']['30/10'], dict(status='take', date='d03', days=3, ret=30.0, reason=None))
        self.assertEqual(r['horizons'][5], dict(status='complete', ret=0.0, index=None, excess=None))

    def test_same_day_both_is_stop_and_gap_fills_at_open(self):
        p = {d: bar(100, 101, 99, 100) for d in self.days}
        p['d02'] = bar(100, 131, 89, 100)
        self.assertEqual(barrier(p, self.days, 1, 100, 30, 10)['status'], 'stop')
        p['d02'] = bar(80, 82, 79, 81)
        r = barrier(p, self.days, 1, 100, 30, 10)
        self.assertEqual((r['status'], r['ret']), ('stop', -20.0))

    def test_missing_entry_and_gap_stop_scan(self):
        p = {d: bar(100, 101, 99, 100) for d in self.days}
        p['d01'] = bar(100, 101, 99, 100, v=0)
        self.assertEqual(evaluate(p, self.days, self.pos, 'd00', {})['status'], 'missing')
        p = {d: bar(100, 101, 99, 100) for d in self.days}
        del p['d04']
        r = evaluate(p, self.days, self.pos, 'd00', {})
        self.assertEqual(r['rules']['30/10']['status'], 'missing')
        self.assertEqual(r['horizons'][5]['status'], 'missing')

    def test_excess_uses_index_open_to_close_and_summary(self):
        p = {d: bar(100, 101, 99, 100) for d in self.days}
        p['d05'] = bar(100, 111, 99, 110)
        idx = {d: dict(open=1000, close=1000) for d in self.days}
        idx['d05'] = dict(open=1000, close=1050)
        r = evaluate(p, self.days, self.pos, 'd00', idx)
        self.assertEqual(r['horizons'][5]['excess'], 5.0)
        s = summarize([dict(r, signal_date='d00')])
        self.assertEqual(s['rules']['10/5']['take'], 1)
        self.assertEqual(s['horizons'][5]['count'], 1)
        self.assertEqual(wilson(0, 0), None)

    def test_integrated_tracking_groups_signals_and_score_bands(self):
        p = {d: bar(100, 101, 99, 100) for d in self.days}
        p['d29'] = bar(110, 111, 109, 110)
        def item(strategy, day):
            r = evaluate(p, self.days, self.pos, day, {})
            return dict(r, strategy=strategy, code='A', name='에이', market='KOSPI', signal_date=day, forward=False)
        rows = integrated_tracking([item('rsi', 'd20'), item('pension', 'd22'), item('rsi_pension', 'd22')], self.days, {'A': p}, 'd29')
        self.assertEqual(rows[0]['kinds'], ['pension', 'rsi']); self.assertEqual(rows[0]['combos'], ['rsi_pension'])
        self.assertEqual((rows[0]['entry_date'], rows[0]['ret']), ('d21', 10.0))
        bands = score_bands({'d05': [('A', 80.0), ('B', 40.0)]}, {'d05'}, {'A': p, 'B': p}, self.days, self.pos, {}, {})
        top = next(b for b in bands['bands'] if b['label'] == '1~20위')
        self.assertEqual((top['observations'], top['horizons'][5]['count']), (2, 2))
        self.assertEqual(next(b for b in bands['bands'] if b['label'] == '50점 미만')['observations'], 1)
        self.assertEqual(score_bands({'d05': [('A', 80.0)]}, set(), {'A': p}, self.days, self.pos, {}, {})['days'], [])

    def test_co_buy_requires_both_flows_and_skips_chase_days(self):
        days = [f'2026-{m:02}-{d:02}' for m in (7, 8, 9, 10) for d in range(1, 29)][:90]
        prices = {'A': {d: dict(open=10000, high=10100, low=9900, close=10000, volume=200000, change_pct=0.0, turnover=2e9) for d in days}}
        rows = []
        for d in days[-10:]:
            rows.append(dict(code='A', date=d, investor='연기금 등', net=3e7))
            rows.append(dict(code='A', date=d, investor='외국인', net=3e7))
        caps = {d: {'A': 1e11} for d in days}
        hits = co_buy_signals(rows, prices, days, caps)
        self.assertEqual(hits[0]['signal_date'], days[-6])  # first day with five live sessions: 1.5억/1,000억 = 0.15% each
        prices['A'][days[-1]] = dict(open=10000, high=10600, low=9900, close=10550, volume=200000, change_pct=5.5, turnover=2e9)
        self.assertNotIn(days[-1], [h['signal_date'] for h in co_buy_signals(rows, prices, days, caps)])
        rows = [r for r in rows if r['investor'] == '연기금 등']
        self.assertEqual(co_buy_signals(rows, prices, days, caps), [])


if __name__ == '__main__':
    unittest.main()
