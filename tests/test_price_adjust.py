import unittest
from collector.price_adjust import adjust_history
from collector.rsi import cutler_series


class PriceAdjustTests(unittest.TestCase):
    def test_reverse_split_is_adjusted_backward(self):
        days = [f'd{i:02}' for i in range(20)]
        h = {d: dict(open=1000 + i, high=1010 + i, low=990 + i, close=1000 + i, volume=1000, change_pct=0.1) for i, d in enumerate(days[:10])}
        for i, d in enumerate(days[10:], 10):
            h[d] = dict(open=10100, high=10200, low=10000, close=10100 + i, volume=100, change_pct=0.1)
        h['d10']['change_pct'] = round((10110 / 10090 - 1) * 100, 2)  # exchange rate vs adjusted base 10,090
        adj, points = adjust_history(h, days)
        self.assertEqual(len(points), 1)
        self.assertAlmostEqual(points[0][1], 10, places=2)
        self.assertAlmostEqual(adj['d09']['close'], 10090, delta=1)
        self.assertAlmostEqual(adj['d09']['volume'], 100, delta=1)
        self.assertEqual(adj['d10']['close'], 10110)
        self.assertNotIn('adjusted', adj['d10'])
        self.assertEqual(h['d09']['close'], 1009)  # source untouched
        s = cutler_series(adj, days)
        self.assertNotEqual(s[10]['reason'], 'break')

    def test_small_difference_and_missing_rate_unchanged(self):
        days = ['a', 'b']
        h = {'a': dict(close=100, volume=1), 'b': dict(close=97, volume=1, change_pct=-1.0)}
        self.assertEqual(adjust_history(h, days)[1], [])
        h = {'a': dict(close=100, volume=1), 'b': dict(close=1000, volume=1)}
        self.assertEqual(adjust_history(h, days)[1], [])


if __name__ == '__main__':
    unittest.main()
