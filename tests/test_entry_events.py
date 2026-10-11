import unittest
from collector.entry_events import build_entry_events

class EntryTests(unittest.TestCase):
    def rows(self, nets):
        dates=[f'2026-08-{i+1:02}' for i in range(len(nets))]
        rows=[dict(investor='연기금 등',code='000001',name='sample',market='KOSPI',date=d,net=n,close=100+i) for i,(d,n) in enumerate(zip(dates,nets))]
        return rows,dict(sessions=dates)

    def test_exit_before_sale_and_current_return(self):
        rows,cal=self.rows([0]*20+[10,0,0,-5,0])
        event=build_entry_events(rows,cal,lookback=20)['events'][0]
        self.assertEqual(event['status'],'closed')
        self.assertEqual(event['end_date'],'2026-08-23')
        self.assertEqual(event['exit_date'],'2026-08-24')
        self.assertAlmostEqual(event['end_return'],(122/120-1)*100)
        self.assertAlmostEqual(event['current_return'],(124/120-1)*100)

    def test_missing_lookback_is_not_zero(self):
        rows,cal=self.rows([0]*19+[None,10])
        self.assertEqual(build_entry_events(rows,cal,lookback=20)['events'],[])

    def test_missing_followup_stops_tracking(self):
        rows,cal=self.rows([0]*20+[10,None,-5])
        event=build_entry_events(rows,cal,lookback=20)['events'][0]
        self.assertEqual(event['status'],'gap')
        self.assertIsNone(event['exit_date'])

    def test_open_and_negative_prior_allowed(self):
        rows,cal=self.rows([-1]*20+[10,0])
        event=build_entry_events(rows,cal,lookback=20)['events'][0]
        self.assertEqual(event['status'],'open')
        self.assertFalse(event['strict_zero_prior'])

    def test_zero_net_with_both_sides_trading_is_not_inactive(self):
        rows,cal=self.rows([0]*20+[10,0])
        for row in rows:row.update(buy=0,sell=0)
        self.assertTrue(build_entry_events(rows,cal,lookback=20)['events'][0]['no_trade_prior'])
        rows[0].update(buy=100,sell=100)
        self.assertFalse(build_entry_events(rows,cal,lookback=20)['events'][0]['no_trade_prior'])
        rows[0].update(buy=None,sell=None)
        self.assertFalse(build_entry_events(rows,cal,lookback=20)['events'][0]['no_trade_prior'])

    def test_gross_sale_excludes_even_when_net_positive(self):
        rows,cal=self.rows([0]*10+[10,5])
        for row in rows:row.update(buy=0,sell=0)
        self.assertTrue(build_entry_events(rows,cal)['events'][0]['no_sale_since'])
        rows[-1].update(buy=10,sell=5)
        self.assertFalse(build_entry_events(rows,cal)['events'][0]['no_sale_since'])
        rows[-1].update(sell=None)
        self.assertIsNone(build_entry_events(rows,cal)['events'][0]['no_sale_since'])

    def test_signal_day_sale_is_outside_followup(self):
        rows,cal=self.rows([0]*10+[10])
        for row in rows:row.update(buy=0,sell=0)
        rows[-1].update(buy=20,sell=10)
        self.assertTrue(build_entry_events(rows,cal)['events'][0]['no_sale_since'])

    def test_default_ten_day_window_and_recent_net(self):
        rows,cal=self.rows([0]*10+[10,-5])
        for row in rows:row.update(buy=0,sell=0)
        result=build_entry_events(rows,cal)
        self.assertEqual(result['lookback'],10)
        self.assertEqual(result['signal_start'],'2026-08-11')
        event=result['events'][0]
        self.assertTrue(event['no_trade_prior'])
        self.assertEqual(event['latest_net'],-5)
        self.assertEqual(event['signal_net'],10)
        self.assertAlmostEqual(event['current_return'],(111/110-1)*100)
        self.assertEqual(build_entry_events(rows,cal,lookback=20)['events'],[])

if __name__=='__main__':unittest.main()
