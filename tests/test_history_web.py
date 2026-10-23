import csv,gzip,hashlib,importlib.util,json,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('historyweb',ROOT/'scripts/build-history-web.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class HistoricalProjectionTests(unittest.TestCase):
    def test_market_qualified_metadata_keys_and_incomplete_warmup(self):
        tempbase=ROOT/'work/test-history';tempbase.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=tempbase) as tmp:
            self.assertTrue(Path(tmp).resolve().is_relative_to(tempbase.resolve()))
            root=Path(tmp);archive=root/'archive';live=root/'live';target=root/'web';index={'days':{}}
            days=[f'2026-01-{i:02}' for i in range(1,13)]
            for i,d in enumerate(days):
                rows=[]
                for investor in ('연기금 등','외국인'):
                    buy=3e8 if i==10 else 0
                    rows.append(dict(code='000001',date=d,name='Fixture',market='KOSDAQ',investor=investor,flow_status='reported',buy=buy,sell=0,net=buy,open=100,high=105,low=95,close=100,volume=100,change_pct=0,turnover=10000,collected_at='2026-01-13T00:00:00Z'))
                raw=root/'daily.csv'
                with raw.open('w',newline='',encoding='utf-8') as f:w=csv.DictWriter(f,fieldnames=rows[0].keys());w.writeheader();w.writerows(rows)
                cp=f'data/history/daily/{d}.csv.gz';mp=f'data/history/metadata/{d}.json.gz'
                for rel,data in [(cp,gzip.compress(raw.read_bytes())),(mp,gzip.compress(json.dumps(dict(date=d,instruments={'KOSDAQ:000001':dict(code='000001',market='KOSDAQ',market_cap=1e11,sector='FixtureSector',metadata_date=d)})).encode()))]:
                    p=archive/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
                index['days'][d]=dict(csv_path=cp,csv_sha256=hashlib.sha256((archive/cp).read_bytes()).hexdigest(),metadata_path=mp,metadata_sha256=hashlib.sha256((archive/mp).read_bytes()).hexdigest(),stocks=1,rows=2)
            (archive/'data/history/index.json').write_text(json.dumps(index));(archive/'data/history/request.json').write_text(json.dumps(dict(expected_sessions=days)))
            module.build(archive,live,target)
            manifest=json.loads((target/'tracking-history.json').read_text());events=json.loads((target/manifest['files'][0]).read_text())
            self.assertEqual(len(events),1);e=events[0]
            self.assertEqual(e['market_cap'],1e11);self.assertEqual(e['signal_market_cap'],1e11)
            self.assertEqual(e['metadata_date'],days[-1]);self.assertEqual(e['signal_metadata_date'],days[10])
            self.assertIsNone(e['quiet_3m'],'Short history cannot be treated as three months without buys')
            self.assertEqual(e['volume_ratio_20'],None)
            quality=json.loads((target/'history-quality.json').read_text());self.assertEqual(quality['metadata_missing'],0)
            (archive/index['days'][days[0]]['csv_path']).write_bytes(b'corrupted')
            with self.assertRaises(AssertionError):module.build(archive,live,target)
if __name__=='__main__':unittest.main()

