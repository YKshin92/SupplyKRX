import unittest
from collector.corporate_position import ACTIONS, entitlement_plan
from collector.price_comparison import price_comparison


class CorporatePositionTest(unittest.TestCase):
    def action(self, code):
        return next(a for a in ACTIONS if a['code']==code)

    def test_split_preserves_fraction_instead_of_free_cash(self):
        plan=entitlement_plan(self.action('025900'),55)
        self.assertEqual(plan['legs'][0]['whole_shares'],137)
        self.assertEqual(plan['legs'][0]['fractional_shares'],'1/2')
        self.assertIsNone(plan['legs'][0]['fractional_cash'])
        self.assertEqual(plan['cash_credited'],0)
        self.assertFalse(plan['account_settled'])
        self.assertEqual(entitlement_plan(self.action('007340'),36)['legs'][0]['whole_shares'],180)

    def test_bonus_separates_existing_and_locked_new_shares(self):
        plan=entitlement_plan(self.action('323990'),117)
        self.assertEqual([p['whole_shares'] for p in plan['legs']],[117,23])
        self.assertEqual(plan['legs'][1]['fractional_shares'],'2/5')
        self.assertEqual(plan['legs'][1]['available_from'],'2023-11-30')

    def test_spinoff_preserves_two_legs_and_rejects_invalid_quantity(self):
        plan=entitlement_plan(self.action('000070'),33)
        self.assertEqual(len(plan['legs']),2)
        self.assertEqual([p['whole_shares'] for p in plan['legs']],[29,31])
        with self.assertRaises(ValueError): entitlement_plan(self.action('000070'),1.5)

    def test_price_break_missing_and_halt_block_raw_comparison(self):
        sessions=['001','002','003']
        p=lambda n:dict(open=n,high=n,low=n,close=n,volume=100,change_pct=0)
        rows={'001':p(100),'002':p(100),'003':p(100)}
        self.assertEqual(price_comparison('001',rows,sessions)['status'],'comparable')
        rows['002']=p(20)
        self.assertEqual(price_comparison('001',rows,sessions)['date'],'002')
        self.assertEqual(price_comparison('003',rows,sessions)['status'],'comparable')
        rows['002']=p(100);rows['002']['volume']=0
        self.assertEqual(price_comparison('001',rows,sessions)['status'],'blocked')
        del rows['002']
        self.assertEqual(price_comparison('001',rows,sessions)['status'],'blocked')
