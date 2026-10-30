import unittest
from collector.new_highs import classify


def bar(c, h=None, v=10):
    return dict(open=c, high=h or c, low=c * 0.98, close=c, volume=v)


class NewHighTests(unittest.TestCase):
    def test_new_high_near_and_coverage(self):
        days = [f'd{i:04}' for i in range(800)]
        hist = {d: bar(100 + (i % 50)) for i, d in enumerate(days)}
        hist[days[100]] = bar(200, 210)  # old peak inside the 3-year window
        hist[days[-1]] = bar(199, 215)  # intraday high breaks the old peak, close does not
        c = classify(hist, days, days[-1])
        self.assertTrue(c['new_high']); self.assertFalse(c['close_new_high'])
        self.assertEqual(c['prior_high_date'], days[100]); self.assertTrue(c['full_window'])
        self.assertEqual(c['old_high_gap'], 699)
        hist[days[-1]] = bar(200, 201)
        c = classify(hist, days, days[-1])
        self.assertFalse(c['new_high']); self.assertTrue(c['near'])
        short = {d: hist[d] for d in days[-100:]}
        c = classify(short, days, days[-1])
        self.assertFalse(c['full_window']); self.assertEqual(c['coverage_from'], days[-100])

    def test_halted_days_are_skipped_and_today_required(self):
        days = [f'd{i:03}' for i in range(40)]
        hist = {d: bar(100) for d in days}
        hist[days[10]] = bar(500, 500, v=0)  # halted bar with a stale/odd price is ignored
        hist[days[-1]] = bar(120)
        self.assertTrue(classify(hist, days, days[-1])['new_high'])
        hist[days[-1]] = bar(120, v=0)
        self.assertIsNone(classify(hist, days, days[-1]))


if __name__ == '__main__':
    unittest.main()
