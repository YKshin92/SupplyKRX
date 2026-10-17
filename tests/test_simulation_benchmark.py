import unittest
from collector.simulation import simulate
from collector.simulation_benchmark import add_benchmark


class BenchmarkTests(unittest.TestCase):
    def setUp(self):
        self.sessions=[f'2026-09-{d:02}' for d in range(1,31)]
        self.history={d:dict(date=d,code='000001',name='샘플',market='KOSDAQ',buy=0,sell=0,net=0,
            open=100,high=105,low=95,close=100,volume=100) for d in self.sessions}
        self.history[self.sessions[10]].update(buy=300_000_000,net=300_000_000)
        self.indices={'KOSPI':{d:dict(open=100,close=110) for d in self.sessions},
            'KOSDAQ':{d:dict(open=200,close=240) for d in self.sessions}}

    def run_case(self,mode='kospi',budget=5050):
        result=simulate({'000001':self.history},self.sessions,budget=budget)
        dataset=dict(indices={k:dict(prices=v) for k,v in self.indices.items()},source='fixture')
        return add_benchmark(result,{'000001':self.history},self.sessions,dataset,mode)

    def test_same_invested_and_same_idle_cash(self):
        r=self.run_case(); b=r['benchmark']
        self.assertEqual(b['invested'],5000);self.assertEqual(b['allocated'],5050);self.assertEqual(b['idle_cash'],50)
        self.assertAlmostEqual(b['index_pnl'],500)
        self.assertAlmostEqual(b['index_return'],500/5050*100)

    def test_stock_take_does_not_stop_index(self):
        self.history[self.sessions[12]].update(high=131,close=125)
        self.indices['KOSPI'][self.sessions[12]]['close']=105
        self.indices['KOSPI'][self.sessions[-1]]['close']=120
        r=self.run_case();b=r['benchmark']
        self.assertEqual(r['trades'][0]['status'],'take');self.assertAlmostEqual(b['strategy_pnl'],1500)
        self.assertAlmostEqual(b['index_pnl'],1000)
        self.assertAlmostEqual(b['curve'][-1]['strategy_pnl'],1500)
        self.assertAlmostEqual(b['curve'][-1]['benchmark_pnl'],1000)

    def test_horizons_ignore_take_and_do_not_shorten(self):
        self.history[self.sessions[12]].update(high=131,close=125)
        r=self.run_case();t=r['trades'][0]
        self.assertEqual(t['horizons']['5']['end_date'],self.sessions[15])
        self.assertEqual(t['horizons']['5']['stock_return'],0)
        self.assertAlmostEqual(t['horizons']['5']['excess_pp'],-10)
        self.assertEqual(t['horizons']['20']['status'],'pending')

    def test_market_matching_uses_kosdaq(self):
        r=self.run_case('market')
        self.assertEqual(r['trades'][0]['benchmark_market'],'KOSDAQ')
        self.assertAlmostEqual(r['benchmark']['index_pnl'],1000)

    def test_missing_stock_excluded_on_both_sides(self):
        self.history[self.sessions[-1]]['close']=None
        r=self.run_case();b=r['benchmark']
        self.assertEqual(b['count'],0);self.assertIsNone(b['strategy_pnl']);self.assertIsNone(b['index_pnl'])
        self.assertEqual(r['trades'][0]['horizons']['5']['status'],'complete')

    def test_missing_index_entry_not_zero_or_forward_filled(self):
        del self.indices['KOSPI'][self.sessions[11]]
        r=self.run_case()
        self.assertEqual(r['benchmark']['count'],0)
        self.assertEqual(r['trades'][0]['horizons']['5']['status'],'index_missing')

    def test_curve_gap_is_null(self):
        del self.indices['KOSPI'][self.sessions[13]]
        r=self.run_case()
        self.assertEqual(r['benchmark']['count'],1)
        self.assertIsNone(r['benchmark']['curve'][13]['benchmark_pnl'])
        self.assertEqual(r['benchmark']['curve'][13]['missing'],1)

    def test_missing_stock_horizon_not_hidden_by_exit(self):
        self.history[self.sessions[12]].update(high=131,close=125)
        self.history[self.sessions[14]]['close']=None
        r=self.run_case()
        self.assertEqual(r['benchmark']['count'],1)
        self.assertEqual(r['trades'][0]['horizons']['5']['status'],'stock_missing')

    def test_excess_and_horizon_coverage_reconcile(self):
        b=self.run_case()['benchmark']
        self.assertAlmostEqual(b['extra_pnl'],b['strategy_pnl']-b['index_pnl'])
        self.assertAlmostEqual(b['excess_pp'],b['strategy_return']-b['index_return'])
        self.assertEqual(b['horizons'][0]['count'],1)
        self.assertEqual(b['horizons'][0]['outperform_count'],0)


if __name__=='__main__': unittest.main()
