import unittest
from collector.simulation import first_signals, trade, simulate, summarize


def row(d, **kw):
    return dict(date=d,code='000001',name='테스트',market='KOSPI',buy=0,sell=0,net=0,
        open=100,high=105,low=95,close=100,volume=100, **kw)


class SimulationTests(unittest.TestCase):
    def setUp(self):
        self.days=[f'2026-09-{d:02}' for d in range(1,25)]
        self.h={d:row(d) for d in self.days}
        self.h[self.days[10]].update(buy=300_000_000,net=300_000_000)
        self.signal=first_signals({'000001':self.h},self.days)[0]

    def test_registration_boundary_and_first_only(self):
        self.h[self.days[22]].update(buy=500_000_000,net=500_000_000)
        self.assertEqual(len(first_signals({'000001':self.h},self.days)),1)
        self.h[self.days[0]]['buy']=100_000_000
        self.assertEqual(first_signals({'000001':self.h},self.days)[0]['signal_date'],self.days[22])

    def test_missing_flow_does_not_become_zero(self):
        self.h[self.days[0]]['sell']=None
        self.assertEqual(first_signals({'000001':self.h},self.days),[])

    def test_entry_next_open_and_whole_shares(self):
        self.h[self.days[11]].update(open=103,high=105)
        t=trade(self.signal,self.h,self.days,5000,30,10)
        self.assertEqual(t['entry_date'],self.days[11]); self.assertEqual(t['shares'],48)
        self.assertEqual(t['invested'],4944); self.assertEqual(t['cash'],56)
        self.assertEqual(t['status'],'open'); self.assertEqual(t['pnl'],-144)

    def test_signal_day_high_cannot_exit(self):
        self.h[self.days[10]]['high']=150
        self.assertEqual(trade(self.signal,self.h,self.days,5000,30,10)['status'],'open')

    def test_same_day_ambiguous_and_duration(self):
        self.h[self.days[11]].update(high=140,low=80)
        t=trade(self.signal,self.h,self.days,5000,30,10)
        self.assertEqual(t['status'],'stop'); self.assertEqual(t['pnl'],-500)
        self.assertTrue(t['ambiguous']); self.assertEqual(t['trading_days'],1); self.assertEqual(t['calendar_days'],0)
        self.assertEqual(trade(self.signal,self.h,self.days,5000,30,10,'take')['status'],'take')

    def test_gap_stop_fills_open(self):
        self.h[self.days[12]].update(open=85,high=90,low=80,close=85)
        t=trade(self.signal,self.h,self.days,5000,30,10)
        self.assertEqual(t['exit_price'],85); self.assertAlmostEqual(t['return_pct'],-15)

    def test_take_and_later_low_ignored(self):
        self.h[self.days[12]].update(high=132,close=125)
        self.h[self.days[13]].update(open=80,high=85,low=75,close=80)
        t=trade(self.signal,self.h,self.days,5000,30,10)
        self.assertEqual(t['status'],'take'); self.assertAlmostEqual(t['pnl'],1500)

    def test_gap_take_fills_open_and_future_sale_kept(self):
        self.h[self.days[12]].update(open=132,high=134,low=125,close=132,sell=1000,net=-1000)
        signals=first_signals({'000001':self.h},self.days)
        self.assertEqual(len(signals),1)
        t=trade(signals[0],self.h,self.days,5000,30,10)
        self.assertEqual(t['exit_price'],132); self.assertAlmostEqual(t['return_pct'],32)

    def test_missing_entry_does_not_invent_execution(self):
        del self.h[self.days[11]]
        t=trade(self.signal,self.h,self.days,5000,30,10)
        self.assertEqual(t['status'],'excluded'); self.assertEqual(t['invested'],0)

    def test_missing_path_keeps_invested_unknown(self):
        del self.h[self.days[12]]
        t=trade(self.signal,self.h,self.days,5000,30,10)
        self.assertEqual(t['status'],'unresolved'); self.assertIsNone(t['pnl'])
        self.assertEqual(summarize([t])['unknown_invested'],5000)

    def test_price_break_not_fake_profit(self):
        self.h[self.days[12]].update(open=200,high=205,low=195,close=200)
        self.assertEqual(trade(self.signal,self.h,self.days,5000,30,10)['status'],'unresolved')

    def test_latest_signal_pending(self):
        h={d:row(d) for d in self.days}
        h[self.days[-1]].update(buy=300_000_000,net=300_000_000)
        s=simulate({'000001':h},self.days)
        self.assertEqual(s['summary']['counts']['pending'],1); self.assertEqual(s['summary']['invested'],0)

    def test_summary_and_curve_reconcile(self):
        s=simulate({'000001':self.h},self.days)
        self.assertEqual(s['summary']['pnl'],s['summary']['gains']-s['summary']['losses'])
        self.assertEqual(s['summary']['pnl'],s['curve'][-1]['pnl'])
        self.assertEqual(s['summary']['pnl'],s['summary']['realized_pnl']+s['summary']['unrealized_pnl'])


if __name__=='__main__': unittest.main()
