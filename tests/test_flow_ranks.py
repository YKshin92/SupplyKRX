import unittest
from collector.flow_ranks import rank_flows
from collector.investors import INVESTORS


class FlowRankTests(unittest.TestCase):
    def fixture(self):
        universe=[dict(code=c,market='KOSPI') for c in ('000001','000002','000003','000004')]
        metadata={c['code']:dict(market_cap=cap,metadata_date='2026-10-26') for c,cap in zip(universe,(100,1000,100,100))}
        rows=[dict(date='2026-10-26',code=c['code'],market='KOSPI',investor=i,net=net) for c,net in zip(universe,(10,20,10,-5)) for i in INVESTORS]
        return rows,['2026-10-26'],'2026-10-26',universe,metadata

    def test_absolute_and_cap_relative_ranks_use_full_population_and_midrank_ties(self):
        result=rank_flows(*self.fixture());by={s['code']:s for s in result['stocks']}
        a=by['000001']['components'];b=by['000002']['components']
        self.assertEqual(a['사모:absolute']['rank'],2.5)
        self.assertEqual(b['사모:absolute']['rank'],1)
        self.assertEqual(a['사모:relative']['value'],10)
        self.assertEqual(a['사모:relative']['rank'],1.5)
        self.assertEqual(b['사모:relative']['rank'],3)
        self.assertEqual(by['000004']['score'],0)
        self.assertEqual(len(by['000001']['components']),8)
        # UI filtering happens on the already computed result, preserving ranks/N.
        selected=[s for s in result['stocks'] if s['code']=='000001'][0]
        self.assertEqual(selected['components']['사모:absolute']['population'],4)

    def test_incomplete_period_or_cap_is_unknown_without_weight_redistribution(self):
        args=list(self.fixture());args[0]=[r for r in args[0] if not (r['code']=='000001' and r['investor']=='사모')]
        args[4]['000002']['market_cap']=None
        result=rank_flows(*args);by={s['code']:s for s in result['stocks']}
        self.assertIsNone(by['000001']['score']);self.assertIsNone(by['000002']['score'])
        self.assertEqual(result['coverage']['사모:absolute']['missing'],1)
        args[1]=['2026-10-23','2026-10-26']
        self.assertTrue(all(s['score'] is None for s in rank_flows(*args)['stocks']))

    def test_future_cap_duplicate_observation_and_universe_mismatch_fail(self):
        args=list(self.fixture());args[4]['000001']['metadata_date']='2026-10-27'
        with self.assertRaises(ValueError):rank_flows(*args)
        args=list(self.fixture());args[0].append(args[0][0])
        with self.assertRaises(ValueError):rank_flows(*args)
        args=list(self.fixture());args[0][0]['market']='KOSDAQ'
        with self.assertRaises(ValueError):rank_flows(*args)
