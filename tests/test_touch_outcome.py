import unittest
from collector.touch_outcome import touch_outcome

class TouchTests(unittest.TestCase):
    def check_rows(self, rows):
        days=['2026-01-01','2026-01-02','2026-01-05'][:len(rows)]
        history={d:dict(open=100,high=101,low=99,close=100,volume=100,**{})|r for d,r in zip(days,rows)}
        return touch_outcome(days[0], history, days)

    def test_touch_order_and_both_later(self):
        r=self.check_rows([{},dict(high=131,close=120),dict(open=100,low=89,close=100)])
        self.assertEqual(r['status'],'take');self.assertTrue(r['stop_touched']);self.assertEqual(r['trading_days'],1)

    def test_same_day_and_opening_gap(self):
        r=self.check_rows([{},dict(high=131,low=89)])
        self.assertEqual(r['status'],'stop');self.assertTrue(r['ambiguous'])
        r=self.check_rows([{},dict(high=101,close=100),dict(open=131,high=132,low=89,close=100)])
        self.assertEqual(r['status'],'take');self.assertFalse(r['ambiguous'])

    def test_missing_does_not_become_zero_or_claim_order(self):
        r=self.check_rows([{},dict(volume=None),dict(high=131,close=120)])
        self.assertEqual(r['status'],'missing');self.assertIsNone(r['take_touched'])
        self.assertEqual(self.check_rows([{}])['status'],'pending')
