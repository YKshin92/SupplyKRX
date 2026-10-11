import unittest
from collector.core import metrics
from test_core import row
from datetime import date,timedelta

class PeriodTests(unittest.TestCase):
    def test_window_changes_totals_and_preserves_missing(self):
        sessions=[str(date(2026,7,10)+timedelta(days=i)) for i in range(60)]
        rows=[row(day=d,net=1) for d in sessions]
        self.assertEqual(metrics(rows,sessions,sessions[-1])['sum20'],20)
        long=metrics(rows,sessions,sessions[-1],60)
        self.assertEqual(long['sum20'],60)
        self.assertEqual(len(long['spark']),60)
        self.assertTrue(long['buy_only20'])
        self.assertIsNone(metrics(rows[1:],sessions,sessions[-1],60)['sum20'])
