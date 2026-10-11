import unittest
from datetime import date,timedelta
from collector.research import build_research,matches,net_return,summarize

class ResearchTests(unittest.TestCase):
    def fixture(self):
        dates=[(date(2026,7,1)+timedelta(days=i)).isoformat() for i in range(45)]
        rows=[]
        for i,d in enumerate(dates):
            row=dict(date=d,code='000001',name='test',market='KOSPI',investor='연기금 등',net=10 if i==10 else 0,
                buy=10 if i==10 else 0,sell=0,close=100+i,open=100+i,volume=100,turnover=10000,change_pct=1,flow_status='reported')
            rows.append(row)
        return rows,dict(sessions=dates,instruments={'000001':dict(market_cap=1e12,sector='future',metadata_date=dates[-1])})

    def test_next_open_exact_holding_window_and_purge(self):
        rows,cal=self.fixture();rows[11]['open']=200
        r=build_research(rows,cal);e=r['events'][0];o=e['outcomes']['5']
        self.assertEqual(o['entry_date'],cal['sessions'][11]);self.assertEqual(o['exit_date'],cal['sessions'][15])
        self.assertAlmostEqual(o['gross'],(115/200-1)*100)
        self.assertEqual(e['outcomes']['20']['split'],'purged')
        self.assertIsNone(e['historical_cap']);self.assertIsNone(e['foreign5'])

    def test_trade_history_and_short_followup(self):
        rows,cal=self.fixture()
        rows[35].update(net=20,buy=20)
        # First qualifying registration must not reset at the second signal.
        r=build_research(rows,cal);self.assertEqual(r['registered'],1)
        self.assertEqual(r['events'][0]['signal_date'],cal['sessions'][10])
        rows[10].update(net=0,buy=0)
        r=build_research(rows,cal);self.assertEqual(r['events'][0]['outcomes']['20']['reason'],'insufficient_followup')

    def test_sale_after_observation_uses_next_open(self):
        rows,cal=self.fixture();rows[12].update(sell=5,net=-5)
        o=build_research(rows,cal)['events'][0]['outcomes']['5']
        self.assertAlmostEqual(o['sale_exit'],(113/111-1)*100)
        self.assertEqual(o['sale_date'],cal['sessions'][13])

    def test_missing_history_and_split_suspicion(self):
        rows,cal=self.fixture();rows[5].update(net=None,buy=None,sell=None)
        self.assertEqual(build_research(rows,cal)['registered'],0)
        rows,cal=self.fixture();rows[12]['close']=400;rows[12]['change_pct']=0
        r=build_research(rows,cal);self.assertTrue(r['events'][0]['outcomes']['5']['anomaly'])
        self.assertEqual(summarize(r['events'],5)['net']['n'],0)

    def test_rule_thresholds_cost_and_missing(self):
        rule=dict(feature='flow_ratio',threshold=1)
        self.assertTrue(matches(dict(flow_ratio=1),rule));self.assertFalse(matches(dict(flow_ratio=None),rule))
        self.assertAlmostEqual(net_return(0,.4),((1-.002)/(1+.002)-1)*100)
        self.assertEqual(net_return(10,0),10.000000000000009)

    def test_future_foreign_and_cap_do_not_change_entry_features(self):
        rows,cal=self.fixture();initial=build_research(rows,cal)['events'][0]
        rows.append({**rows[30],'investor':'외국인','net':999999999})
        cal['instruments']['000001']['market_cap']=9e15
        final=build_research(rows,cal)['events'][0]
        for key in ['rules','foreign_net','foreign5','flow_ratio','prior5','historical_cap']:
            self.assertEqual(initial[key],final[key])

if __name__=='__main__':unittest.main()
