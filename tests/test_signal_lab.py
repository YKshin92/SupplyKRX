import unittest
from collector.signal_lab import barrier, evaluate, summarize, wilson


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


if __name__ == '__main__':
    unittest.main()
