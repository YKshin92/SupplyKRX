import unittest
from collector.tracking import build_tracking

class TrackingTests(unittest.TestCase):
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
