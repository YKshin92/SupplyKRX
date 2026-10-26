import unittest
from collector.split_lifecycle import split_day


class SplitLifecycleTests(unittest.TestCase):
    def fixture(self):
        return dict(entry_date='001',entry_price=100,invested=1000,shares=10,basis_price=100,
                    phase='active',last_close=110,applied_actions=[]),dict(id='split',known_on='001',halt_start='002',resume_date='004',numerator=5,denominator=1)
    def price(self,n):
        return dict(open=n,high=n,low=n,close=n,volume=100,change_pct=None)
    def test_halt_resume_original_cost_and_idempotence(self):
        p,a=self.fixture();halt=split_day(p,a,'002',None)
        self.assertEqual(halt['phase'],'halted');self.assertEqual(p['phase'],'active')
        self.assertEqual(split_day(halt,a,'003',None)['cash_delta'],0)
        resume=split_day(halt,a,'004',self.price(22))
        self.assertEqual(resume['shares'],50);self.assertEqual(resume['entry_price'],100)
        self.assertEqual(resume['basis_price'],20);self.assertEqual(resume['invested'],1000)
        self.assertEqual(split_day(resume,a,'004',self.price(22)),resume)
    def test_unknown_gap_failed_resume_and_fraction_do_not_auto_recover(self):
        p,a=self.fixture();gap=split_day(p,a,'001',None)
        self.assertEqual(split_day(gap,a,'004',self.price(22))['phase'],'unresolved')
        halt=split_day(p,a,'002',None);failed=split_day(halt,a,'004',None)
        self.assertEqual(split_day(failed,a,'005',self.price(22))['phase'],'unresolved')
        p['shares']=55;a.update(numerator=5,denominator=2)
        fractional=split_day(split_day(p,a,'002',None),a,'004',self.price(44))
        self.assertEqual(fractional['phase'],'unresolved');self.assertEqual(fractional['shares'],55)
        self.assertEqual(fractional['fractional_claim'],dict(numerator=1,denominator=2))
    def test_future_action_cannot_explain_an_earlier_missing_quote(self):
        p,a=self.fixture();a['known_on']='003'
        self.assertEqual(split_day(p,a,'002',None)['phase'],'unresolved')

    def test_invalid_shares_and_ratio_are_rejected(self):
        p,a=self.fixture()
        for shares in (0,-1,True,1.5,9007199254740992):
            with self.subTest(shares=shares), self.assertRaises(ValueError):
                split_day(dict(p,shares=shares),a,'002',None)
        halt=split_day(p,a,'002',None)
        for numerator in (True,0,-1,1.5,9007199254740991):
            with self.subTest(numerator=numerator), self.assertRaises(ValueError):
                split_day(halt,dict(a,numerator=numerator),'004',self.price(22))
