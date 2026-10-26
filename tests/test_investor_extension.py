import json,tempfile,unittest,importlib.util
from pathlib import Path
from collector.investors import INVESTORS,PUBLICATION_PATHS,collection_start
from collector.core import upsert,load_rows,publish,validate,csv_text
from collector.metadata_snapshots import write_snapshots


def row(investor,day='2026-10-23',net=10):
    return dict(date=day,code='000001',name='Fixture',market='KOSPI',investor=investor,scope='KRX',buy=max(net,0),sell=max(-net,0),net=net,buy_volume=None,sell_volume=None,net_volume=None,open=100,high=110,low=90,close=100,change_pct=0,volume=100,turnover=10000,source='unit-test',collected_at='2026-10-23T09:00:00Z',finality='unknown')


class InvestorExtensionTests(unittest.TestCase):
    def test_isolated_readiness_rejects_partial_investor_and_cap_date(self):
        root_module=Path(__file__).resolve().parents[1]
        spec=importlib.util.spec_from_file_location('investor_verify',root_module/'scripts/verify-investor-collection.py')
        verifier=importlib.util.module_from_spec(spec);spec.loader.exec_module(verifier)
        base=Path('work/test-four-investors');base.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as tmp:
            root=Path(tmp);rows=[]
            for market,code in [('KOSPI','000001'),('KOSDAQ','000002')]:
                rows.extend(dict(row(i),market=market,code=code) for i in INVESTORS)
            upsert(root/'data/live',rows)
            metadata={code:dict(market_cap=1000,metadata_date='2026-10-23',metadata_source='fixture') for code in ('000001','000002')}
            write_snapshots(root/'data/live',{'2026-10-23':metadata},'fixture')
            report=verifier.verify(root)
            self.assertEqual(len(report['groups']),8);self.assertEqual(report['rows'],8)
            incomplete=[r for r in rows if not (r['market']=='KOSPI' and r['investor']=='사모')]
            (root/'data/live/daily/2026-10-23.csv').write_text(csv_text(incomplete),encoding='utf-8-sig')
            with self.assertRaises(ValueError):verifier.verify(root)
    def test_four_investors_publish_separately_and_partial_legacy_is_not_zero_filled(self):
        base=Path('work/test-four-investors');base.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as tmp:
            root=Path(tmp)/'raw';target=Path(tmp)/'web'
            legacy=[row('연기금 등','2026-10-22'),row('외국인','2026-10-22')]
            current=[row(i,net=n) for i,n in zip(INVESTORS,(10,-20,0,30))]
            upsert(root,legacy+current)
            actual=load_rows(root);self.assertEqual(len(actual),6)
            self.assertFalse(any(r['date']=='2026-10-22' and r['investor']=='사모' for r in actual))
            results=publish(root,target,'live',dict(sessions=['2026-10-22','2026-10-23'],checked_through='2026-10-23',source='fixture'))
            self.assertEqual(set(results),set(INVESTORS))
            for investor,path in PUBLICATION_PATHS.items():
                manifest=json.loads((target/path/'manifest.json').read_text(encoding='utf-8'))
                self.assertEqual(manifest['investor'],investor)
                if investor=='기관합계':self.assertIn('사모',manifest['investor_components'])
                if investor=='사모':self.assertEqual(manifest['investor_parent'],'기관합계')
                summary=json.loads((target/path/manifest['generation']/'summary.json').read_text(encoding='utf-8'))
                self.assertEqual(summary[0]['net'],next(r['net'] for r in current if r['investor']==investor))
                if investor in ('사모','기관합계'):self.assertEqual(summary[0]['days'],1)
            with self.assertRaises(ValueError):validate(row('기관'))

    def test_initial_collection_does_not_skip_missing_new_investors_or_market(self):
        rows=[dict(date=d,market=m,investor=i) for d in ('2026-10-21','2026-10-22','2026-10-23') for m in ('KOSPI','KOSDAQ') for i in INVESTORS]
        self.assertEqual(collection_start(rows),'2026-10-21')
        self.assertIsNone(collection_start([r for r in rows if r['investor']!='사모']))
        self.assertIsNone(collection_start(rows[:-1]))
        self.assertEqual(collection_start(rows[:-1],'2026-10-22'),'2026-10-22')

    def test_metadata_date_and_atomic_batch_validation(self):
        base=Path('work/test-four-investors');base.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as tmp:
            root=Path(tmp)
            item=dict(market_cap=1000000000,metadata_date='2026-10-23',metadata_source='fixture',sector=None)
            write_snapshots(root,{'2026-10-23':{'000001':item}},'2026-10-23T09:00:00Z')
            saved=json.loads((root/'metadata/daily/2026-10-23.json').read_text(encoding='utf-8'))
            self.assertEqual(saved['as_of'],'2026-10-23');self.assertEqual(saved['instruments']['000001']['market_cap'],1e9)
            with self.assertRaises(ValueError):write_snapshots(root,{'2026-10-22':{'000001':item}},'fixture')
            self.assertFalse((root/'metadata/daily/2026-10-22.json').exists())
