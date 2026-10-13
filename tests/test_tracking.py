import unittest
from collector.tracking import build_tracking, five_day_outcome

class TrackingTests(unittest.TestCase):
    def test_five_day_outcome_requires_full_window_and_uses_next_open(self):
        signal=dict(close=100)
        after=[dict(date=f'2026-08-{i+1:02}',open=110,high=120,low=99,close=110,volume=10,change_pct=None) for i in range(6)]
        after[4]['close']=115
        after[5]['close']=999
        result=five_day_outcome(signal,after)
        self.assertEqual(result['outcome_status'],'complete')
        self.assertAlmostEqual(result['return_5d'],(115/110-1)*100)
        self.assertAlmostEqual(result['downside_5d'],-10)
        self.assertAlmostEqual(result['peak_5d'],20)
        self.assertEqual(result['outcome_end_date'],'2026-08-05')
        self.assertEqual(five_day_outcome(signal,after[:4])['outcome_status'],'pending')
        after[2]['volume']=0
        self.assertIsNone(five_day_outcome(signal,after)['return_5d'])
        after[2]['volume']=10;after[2]['change_pct']=20
        self.assertEqual(five_day_outcome(signal,after)['outcome_status'],'price_break')
    def test_score_inputs_use_signal_date_not_future_foreign_flow(self):
        rows,cal=self.fixture()
        rows += [dict(rows[10],investor='외국인',buy=3e8,net=2e8),dict(rows[11],investor='외국인',buy=9e8,net=9e8)]
        e=build_tracking(rows,cal)['events'][0]
        self.assertEqual(e['signal_buy'],6e8)
        self.assertEqual(e['foreign_buy'],3e8)
        self.assertEqual(e['foreign_net'],2e8)
        rows,cal=self.fixture()
        self.assertIsNone(build_tracking(rows,cal)['events'][0]['foreign_buy'])
    def fixture(self):
        rows=[dict(code='000001',name='sample',market='KOSPI',investor='연기금 등',date=f'2026-08-{i+1:02}',buy=0,sell=0,net=0,close=100+i,flow_status='reported') for i in range(13)]
        rows[0].update(buy=1e7,net=1e7)
        rows[10].update(buy=6e8,net=6e8)
        rows[11].update(buy=2e8,sell=1e6,net=199e6)
        return rows,dict(sessions=[r['date'] for r in rows])
    def test_small_sale_and_signal_baseline(self):
        rows,cal=self.fixture();e=build_tracking(rows,cal)['events'][0]
        self.assertEqual(e['prior']['10']['max_buy'],1e7)
        self.assertEqual(e['prior']['10']['avg_gross'],1e6)
        self.assertTrue(e['no_net_sale']);self.assertFalse(e['no_gross_sale'])
        self.assertEqual(e['sum_since'],799e6);self.assertEqual(e['buy_days'],2)
        self.assertAlmostEqual(e['current_return'],(112/110-1)*100)
        self.assertIsNone(e['prior']['20'])
    def test_missing_prior_never_qualifies_as_zero(self):
        rows,cal=self.fixture();rows[0]['buy']=None
        self.assertNotIn('2026-08-11',[e['signal_date'] for e in build_tracking(rows,cal)['events']])
    def test_missing_followup_and_known_sale(self):
        rows,cal=self.fixture();rows[12].update(net=None,sell=None)
        e=build_tracking(rows,cal)['events'][0]
        self.assertIsNone(e['no_net_sale']);self.assertIsNone(e['sum_since'])
        rows[11].update(net=-1)
        self.assertFalse(build_tracking(rows,cal)['events'][0]['no_net_sale'])
