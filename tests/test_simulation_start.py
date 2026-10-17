import unittest
from collector.simulation import first_signals,simulate,simulation_start
from collector.simulation_portfolio import simulate_portfolio


class StartDateTests(unittest.TestCase):
    def setUp(self):
        self.days=[f'2026-09-{d:02}' for d in range(1,29)]
        self.h={'000001':{d:dict(date=d,code='000001',name='샘플',market='KOSPI',buy=0,sell=0,net=0,
            open=100,high=105,low=95,close=100,volume=10) for d in self.days}}
        self.f={'000001':{d:dict(buy=0,net=0) for d in self.days}}
        for i in (10,22):self.h['000001'][self.days[i]].update(buy=300_000_000,net=300_000_000)
        self.ix=dict(indices={'KOSPI':dict(prices={d:dict(open=100,close=100) for d in self.days})})

    def test_first_signal_inside_period_with_warmup(self):
        signals=first_signals(self.h,self.days,start_date=self.days[22])
        self.assertEqual(len(signals),1)
        self.assertEqual(signals[0]['signal_date'],self.days[22])
        self.assertEqual(signals[0]['signal_index'],22)

    def test_no_carry_of_old_signal_or_position(self):
        r=simulate_portfolio(self.h,self.f,self.days,self.ix,initial=300,budget=300,start_date=self.days[11])
        self.assertEqual(r['trades'][0]['signal_date'],self.days[22])
        self.assertEqual(r['trades'][0]['entry_date'],self.days[23])
        self.assertEqual(r['account']['ledger'][0]['morning_cash'],300)
        self.assertEqual(r['account']['ledger'][0]['holdings'],0)
        self.assertEqual(r['account']['ledger'][0]['waiting'],0)
        self.assertEqual(r['account']['ledger'][0]['date'],self.days[11])

    def test_independent_mode_uses_same_start_semantics(self):
        r=simulate(self.h,self.days,start_date=self.days[22])
        self.assertEqual(r['first_date'],self.days[22]);self.assertEqual(r['data_first_date'],self.days[0])
        self.assertEqual(r['curve'][0]['date'],self.days[22])
        self.assertEqual(r['trades'][0]['entry_date'],self.days[23])

    def test_holiday_moves_to_next_session(self):
        sessions=[self.days[0],self.days[3],self.days[4]]
        self.assertEqual(simulation_start(sessions,self.days[1]),self.days[3])

    def test_bad_dates_rejected(self):
        for value in ('2026-08-01','2026-10-01','2026-09-31','20260915','bad'):
            with self.subTest(value=value),self.assertRaises(ValueError):simulation_start(self.days,value)

    def test_latest_start_keeps_signal_pending_no_fake_buy(self):
        r=simulate_portfolio(self.h,self.f,self.days,self.ix,initial=300,budget=300,start_date=self.days[-1])
        self.assertEqual(r['summary']['bought'],0)
        self.assertEqual(r['account']['cash'],300);self.assertEqual(r['account']['equity'],300)
        self.assertEqual(len(r['account']['ledger']),1)

    def test_default_equivalent_to_full_range(self):
        a=simulate_portfolio(self.h,self.f,self.days,self.ix,initial=300,budget=300)
        b=simulate_portfolio(self.h,self.f,self.days,self.ix,initial=300,budget=300,start_date=self.days[0])
        self.assertEqual(a['account'],b['account']);self.assertEqual(a['trades'],b['trades'])


if __name__=='__main__':unittest.main()
