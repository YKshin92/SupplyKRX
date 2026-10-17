from datetime import date,timedelta
import unittest
from collector.simulation_portfolio import entry_score,simulate_portfolio


class PortfolioTests(unittest.TestCase):
    def setUp(self):
        self.sessions=[(date(2026,9,1)+timedelta(days=i)).isoformat() for i in range(26)]
        self.h={};self.f={}
        for code,buy in [('000001',3_000_000_000),('000002',300_000_000)]:
            self.h[code]={d:dict(date=d,code=code,name=code,market='KOSPI',buy=0,sell=0,net=0,
                open=100,high=105,low=95,close=100,volume=10) for d in self.sessions}
            self.h[code][self.sessions[10]].update(buy=buy,net=buy)
            self.f[code]={d:dict(buy=0,net=0) for d in self.sessions}
        prices={d:dict(open=100,close=110) for d in self.sessions}
        self.indices=dict(indices={'KOSPI':dict(prices=prices)})

    def run_case(self,initial=300,budget=300):
        return simulate_portfolio(self.h,self.f,self.sessions,self.indices,initial=initial,budget=budget,take=15,stop=10)

    def test_score_priority_no_partial_position(self):
        r=self.run_case(initial=500)
        self.assertEqual(r['summary']['bought'],1)
        self.assertEqual(r['trades'][0]['code'],'000001')
        self.assertEqual(r['trades'][0]['invested'],300)
        self.assertEqual(r['trades'][1]['status'],'pending')
        self.assertEqual(r['account']['cash'],200)

    def test_sale_cash_reused_next_session_and_actual_entry_price(self):
        self.h['000001'][self.sessions[11]]['high']=116
        self.h['000002'][self.sessions[12]].update(open=120,high=125,low=115,close=120)
        r=self.run_case();t=r['trades'][1]
        self.assertEqual(t['entry_date'],self.sessions[12]);self.assertEqual(t['entry_price'],120)
        self.assertEqual(t['shares'],2);self.assertEqual(t['wait_days'],1)
        self.assertEqual(r['account']['delayed_buys'],1)
        self.assertEqual(r['account']['ledger'][11]['buy_count'],1)
        self.assertEqual(r['account']['ledger'][11]['sell_count'],1)

    def test_no_same_day_sale_funding(self):
        self.h['000001'][self.sessions[12]]['high']=116
        r=self.run_case()
        self.assertEqual(r['trades'][1]['entry_date'],self.sessions[13])

    def test_waiting_signal_not_lost_after_days(self):
        self.h['000001'][self.sessions[20]]['high']=116
        r=self.run_case()
        self.assertEqual(r['trades'][1]['entry_date'],self.sessions[21])
        self.assertEqual(r['trades'][1]['wait_days'],10)

    def test_new_high_score_jumps_ahead_of_waiting_low_score(self):
        self.h['000003']={d:dict(self.h['000002'][d],code='000003',name='000003',buy=0,net=0) for d in self.sessions}
        self.h['000003'][self.sessions[11]].update(buy=2_000_000_000,net=2_000_000_000)
        self.f['000003']={d:dict(buy=0,net=0) for d in self.sessions}
        self.h['000001'][self.sessions[11]]['high']=116
        r=self.run_case()
        buys=[a['code'] for a in r['account']['actions'] if a['action']=='buy']
        self.assertEqual(buys,['000001','000003'])

    def test_missing_score_not_invented(self):
        self.f['000001']={}
        r=self.run_case()
        self.assertEqual(r['trades'][0]['status'],'score_missing')
        self.assertEqual(r['trades'][1]['invested'],300)

    def test_future_data_cannot_change_entry_priority(self):
        r=self.run_case()
        self.h['000002'][self.sessions[-1]]['net']=999_000_000_000
        self.f['000002'][self.sessions[-1]]['buy']=999_000_000_000
        changed=self.run_case()
        self.assertEqual(r['trades'][0]['score'],changed['trades'][0]['score'])
        self.assertEqual([t['entry_date'] for t in r['trades']],[t['entry_date'] for t in changed['trades']])

    def test_entry_does_not_know_same_day_close_missing(self):
        self.h['000001'][self.sessions[11]]['close']=None
        r=self.run_case()
        self.assertEqual(r['trades'][0]['invested'],300)
        self.assertEqual(r['trades'][0]['status'],'unresolved')
        self.assertEqual(r['account']['unknown_cost'],300)
        self.assertIsNone(r['account']['equity']);self.assertIsNone(r['account']['pnl'])
        self.assertEqual(r['account']['cash'],0)
        self.assertIsNone(r['benchmark']['strategy_return'])

    def test_ledger_conservation_and_benchmark_is_fixed_initial_capital(self):
        self.h['000001'][self.sessions[11]]['high']=116
        r=self.run_case();a=r['account'];cash=300
        for day in a['ledger']:
            self.assertAlmostEqual(day['morning_cash'],cash)
            cash=cash-day['buy_value']+day['sale_proceeds']
            self.assertAlmostEqual(cash,day['end_cash']);self.assertGreaterEqual(day['after_buys_cash'],0)
        self.assertAlmostEqual(a['equity'],300+r['summary']['pnl'])
        self.assertAlmostEqual(r['benchmark']['index_pnl'],30)
        self.assertEqual(r['benchmark']['allocated'],300)

    def test_signal_score_scale_and_missing(self):
        s=entry_score(dict(buy=3e9,net=3e9),dict(buy=3e9,net=3e9))
        self.assertEqual(s['total'],100)
        self.assertIsNone(entry_score(dict(buy=3e9,net=3e9),{})['total'])


if __name__=='__main__': unittest.main()
