import unittest
from collector.simulation_prices import supplement,needs_quote,REPAIR_FIELDS,verify_anchors


class SupplementalPriceTests(unittest.TestCase):
    def setUp(self):
        self.row=dict(date='2026-10-16',code='000001',buy=300_000_000,sell=1,net=299_999_999,
            open=None,high=None,low=None,close=None,volume=None,change_pct=None,turnover=None)
        self.record=dict(status='verified',url='https://finance.naver.com/',base={k:self.row.get(k) for k in REPAIR_FIELDS},
            quote=dict(open=100,high=110,low=90,close=105,volume=1000,change_pct=5))

    def test_fills_only_missing_prices_preserves_flow_and_raw(self):
        got=supplement(self.row,self.record)
        self.assertEqual(got['close'],105);self.assertEqual(got['volume'],1000)
        self.assertEqual(got['buy'],300_000_000);self.assertEqual(got['net'],299_999_999)
        self.assertIsNone(got['turnover']);self.assertIsNone(self.row['close'])

    def test_suspension_not_fabricated_into_trade(self):
        self.row.update(close=100,volume=0)
        self.assertFalse(needs_quote(self.row));self.assertEqual(supplement(self.row,self.record),self.row)

    def test_changed_original_price_invalidates_stale_supplement(self):
        self.row['close']=106
        self.assertEqual(supplement(self.row,self.record),self.row)

    def test_conflicting_existing_field_not_overwritten(self):
        self.row['open']=99;self.record['base']['open']=99
        self.assertEqual(supplement(self.row,self.record),self.row)

    def test_unverified_or_invalid_quote_ignored(self):
        for change in ({'high':80},{'volume':0},{'close':float('nan')},{'open':100.5},{'volume':2**54}):
            rec={**self.record,'quote':{**self.record['quote'],**change}}
            self.assertEqual(supplement(self.row,rec),self.row)
        self.record['status']='unverified'
        self.assertEqual(supplement(self.row,self.record),self.row)

    def test_new_listing_requires_symbol_name_and_origin(self):
        previous=dict(self.row,date='2026-10-15',name='샘플',open=100,high=110,low=90,close=105,volume=1000)
        current=dict(self.row,name='샘플')
        history={'2026-10-15':previous,'2026-10-16':current}
        bars={'2026-10-15':dict(self.record['quote'])}
        identity=dict(symbol='000001',name='샘플',origintime='20261015')
        anchors,policy=verify_anchors(history,bars,'2026-10-16',identity)
        self.assertEqual(policy,'new_listing_one_anchor_and_listing_metadata')
        self.assertEqual(anchors,['2026-10-15'])
        for changes in ({'symbol':'999999'},{'name':'다른 종목'},{'origintime':'20200101'}):
            self.assertIsNone(verify_anchors(history,bars,'2026-10-16',{**identity,**changes})[1])

    def test_anchor_split_or_volume_mismatch_rejected(self):
        previous=dict(self.row,date='2026-10-15',name='샘플',open=100,high=110,low=90,close=105,volume=1000)
        history={'2026-10-15':previous,'2026-10-16':dict(self.row,name='샘플')}
        identity=dict(symbol='000001',name='샘플',origintime='20261015')
        for changed in ({'open':50},{'volume':2000}):
            bars={'2026-10-15':{**self.record['quote'],**changed}}
            self.assertIsNone(verify_anchors(history,bars,'2026-10-16',identity)[1])


if __name__=='__main__':unittest.main()
