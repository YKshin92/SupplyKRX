import unittest
from collector.candle import candle_of


class CandleTests(unittest.TestCase):
    def test_close_against_open(self):
        self.assertEqual(candle_of(dict(open=100, close=101)), 'bull')
        self.assertEqual(candle_of(dict(open=100, close=99)), 'bear')
        self.assertEqual(candle_of(dict(open=100, close=100)), 'flat')

    def test_missing_prices_are_unknown(self):
        self.assertIsNone(candle_of(None))
        self.assertIsNone(candle_of(dict(open=None, close=100)))
        self.assertIsNone(candle_of(dict(open=0, close=100)))


if __name__ == '__main__':
    unittest.main()
