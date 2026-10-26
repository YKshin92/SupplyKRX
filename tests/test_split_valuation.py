import unittest
from collector.split_valuation import split_value


class SplitValuationTests(unittest.TestCase):
    def fixture(self):
        return dict(entry_price=100,invested=1000,shares=50,basis_price=20,phase='active',last_close=22),dict(open=22,high=23,low=21,close=22,volume=100)

    def test_adjusted_units_preserve_original_cost_and_do_not_credit_cash(self):
        p,q=self.fixture()
        value=split_value(p,q)
        self.assertEqual(value['status'],'open')
        self.assertEqual(value['pnl'],100)
        self.assertEqual(value['sale_proceeds'],0)
        self.assertEqual(p['entry_price'],100)
        self.assertEqual(p['shares'],50)

    def test_gap_and_both_barriers_conservative_fill(self):
        p,q=self.fixture()
        for opening,status,exit_price in ((27,'take',27),(17,'stop',17)):
            value=split_value(p,dict(q,open=opening,high=opening+1,low=opening-1,close=opening))
            self.assertEqual((value['status'],value['exit_price']),(status,exit_price))
        value=split_value(p,dict(q,open=20,high=27,low=17))
        self.assertTrue(value['ambiguous'])
        self.assertEqual((value['status'],value['exit_price']),('stop',18))

    def test_unknown_and_halt_do_not_become_confirmed_equity(self):
        p,q=self.fixture()
        for phase in ('halted','unresolved'):
            value=split_value(dict(p,phase=phase),q)
            self.assertIsNone(value['confirmed_value'])
            self.assertIsNone(value['pnl'])
            self.assertEqual(value['sale_proceeds'],0)
        self.assertEqual(split_value(p,dict(q,volume=0))['status'],'unresolved')
        self.assertEqual(split_value(p,None)['status'],'unresolved')

    def test_invalid_settings_and_cost_fail(self):
        p,q=self.fixture()
        for take,stop in ((float('nan'),10),(30,float('inf')),(0,10),(30,51),(True,10)):
            with self.assertRaises(ValueError): split_value(p,q,take,stop)
        for update in (dict(shares=0),dict(shares=1.5),dict(invested=-1)):
            with self.assertRaises(ValueError): split_value(dict(p,**update),q)
