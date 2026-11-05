import json,tempfile,unittest,importlib.util
from pathlib import Path
from collector.core import upsert,save_json
from collector.investors import INVESTORS
from collector.metadata_snapshots import write_snapshots
from collector.publish_flow_ranks import publish_ranks
from test_investor_extension import row


class RankProjectionTests(unittest.TestCase):
    def test_independent_projection_audit_detects_corrupt_rank(self):
        source=Path(__file__).resolve().parents[1]/'scripts/verify-flow-ranks.py'
        spec=importlib.util.spec_from_file_location('verify_ranks',source);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        base=Path('work/test-rank-projection');base.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as tmp:
            root=Path(tmp);self.fixture(root);target=root/'web';m=publish_ranks(root,target)['views']['latest']
            self.assertEqual(module.verify(target)['latest']['complete_scores'],1)
            p=target/'flow-ranks'/m['generation']/m['files'][0];stocks=json.loads(p.read_text(encoding='utf-8'))
            stocks[0]['components']['사모:absolute']['rank']=2;save_json(p,stocks)
            with self.assertRaises(ValueError):module.verify(target)
    def fixture(self,root):
        raw=root/'data/live';days=['2026-09-01','2026-10-23','2026-10-26']
        upsert(raw,[row(i,'2026-10-26') for i in INVESTORS])
        save_json(raw/'calendar.json',dict(sessions=days,checked_through=days[-1],source='fixture'))
        meta={'000001':dict(market_cap=1000,metadata_date=days[-1],metadata_source='fixture')}
        universe=dict(as_of=days[-1],classification_observed_date=days[-1],classification_status='asof_observed',source='fixture',stocks=[dict(code='000001',market='KOSPI',name='Fixture')])
        write_snapshots(raw,{days[-1]:meta},'fixture',{days[-1]:universe})
        return raw,meta,universe

    def test_multibyte_rows_are_partitioned_below_the_byte_budget(self):
        base=Path('work/test-rank-projection');base.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as tmp:
            root=Path(tmp);raw,meta,u=self.fixture(root)
            for code in ('000002','000003'):
                upsert(raw,[dict(row(i,'2026-10-26'),code=code,name='테스트종목') for i in INVESTORS])
                meta[code]=dict(meta['000001']);u['stocks'].append(dict(code=code,market='KOSPI',name='테스트종목'))
            write_snapshots(raw,{'2026-10-26':meta},'fixture',{'2026-10-26':u})
            result=publish_ranks(root,root/'web',1700)['views']['latest']
            parts=[root/'web/flow-ranks'/result['generation']/f for f in result['files']]
            self.assertGreater(len(parts),1)
            self.assertTrue(all(p.stat().st_size<=1700 for p in parts))
            self.assertEqual(sum(len(json.loads(p.read_text(encoding='utf-8'))) for p in parts),3)

    def test_projection_full_universe_shards_and_missing_month_history(self):
        base=Path('work/test-rank-projection');base.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as tmp:
            root=Path(tmp);raw,meta,u=self.fixture(root);target=root/'web'
            result=publish_ranks(root,target,1600)
            latest=result['views']['latest'];p=target/'flow-ranks'/latest['generation']/latest['files'][0]
            stocks=json.loads(p.read_text(encoding='utf-8'))
            self.assertEqual(stocks[0]['score'],100)
            self.assertLessEqual(p.stat().st_size,1600)
            month=result['views']['1m'];q=target/'flow-ranks'/month['generation']/month['files'][0]
            self.assertIsNone(json.loads(q.read_text(encoding='utf-8'))[0]['score'])
            self.assertEqual(result['views']['3m']['warmup_coverage'],'partial_calendar')
            self.assertEqual(result,publish_ranks(root,target,1600))
            snapshot=json.loads((raw/'metadata/daily/2026-10-26.json').read_text(encoding='utf-8'));snapshot.pop('universe');save_json(raw/'metadata/daily/2026-10-26.json',snapshot)
            self.assertEqual(publish_ranks(root,target)['state'],'unavailable')
            self.assertEqual(json.loads((target/'flow-ranks/latest.json').read_text(encoding='utf-8'))['state'],'unavailable')

    def test_later_survivor_universe_cannot_replace_observed_cohort(self):
        base=Path('work/test-rank-projection');base.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as tmp:
            raw,meta,u=self.fixture(Path(tmp))
            later={**u,'classification_observed_date':'2026-10-27','classification_status':'historical_classification_unverified','stocks':[dict(code='000002',market='KOSDAQ')]}
            write_snapshots(raw,{'2026-10-26':meta},'later',{'2026-10-26':later})
            saved=json.loads((raw/'metadata/daily/2026-10-26.json').read_text(encoding='utf-8'))
            self.assertEqual(saved['universe'],u);self.assertTrue(saved['universe_preserved_from_snapshot'])

    def test_windows_rank_change_and_pension_markers(self):
        """5d/20d windows, previous-session rank change, 연기금 quiet-3m/first-buy/signal markers, pension score (2026-11-06)."""
        from datetime import date,timedelta
        base=Path('work/test-rank-projection');base.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as tmp:
            root=Path(tmp);raw=root/'data/live'
            days=[];d=date(2026,7,1)
            while len(days)<100:
                if d.weekday()<5:days.append(d.isoformat())
                d+=timedelta(days=1)
            as_of,prev=days[-1],days[-2]
            def flows(code,day,pension_net,other=1,buy=None,sell=None,volume=1000):
                out=[]
                for inv in INVESTORS:
                    net=pension_net if inv=='연기금 등' else other
                    r=dict(row(inv,day,net),code=code,name='S'+code,volume=volume)
                    if inv=='연기금 등' and buy is not None:r.update(buy=buy,sell=sell,net=buy-sell)
                    out.append(r)
                return out
            rows=[]
            for day in days:
                # A: quiet for 3 months, then a 4억 first buy on as_of with normal volume → signal
                rows+=flows('000001',day,0,buy=0,sell=0) if day!=as_of else flows('000001',day,4e8,buy=4e8,sell=0)
                # B: sold 2억 inside the window (not quiet), big buy on as_of
                rows+=flows('000002',day,0,buy=0,sell=(2e8 if day==days[-10] else 0)) if day!=as_of else flows('000002',day,5e8,buy=5e8,sell=0)
                # C: steady buyer every day (not quiet), strongest on prev day so its rank falls today
                rows+=flows('000003',day,3e8 if day==prev else 1e6)
            upsert(raw,rows)
            save_json(raw/'calendar.json',dict(sessions=days,checked_through=as_of,source='fixture'))
            codes=('000001','000002','000003')
            meta={c:dict(market_cap=1000,metadata_date=as_of,metadata_source='fixture') for c in codes}
            uni=lambda day:dict(as_of=day,classification_observed_date=day,classification_status='asof_observed',source='fixture',stocks=[dict(code=c,market='KOSPI',name='S'+c) for c in codes])
            write_snapshots(raw,{as_of:meta,prev:{c:dict(v,metadata_date=prev) for c,v in meta.items()}},'fixture',{as_of:uni(as_of),prev:uni(prev)})
            target=root/'web';result=publish_ranks(root,target)
            self.assertEqual(set(result['views']),{'latest','5d','20d','1m','2m','3m'})
            self.assertEqual(result['views']['5d']['sessions'],5);self.assertEqual(result['views']['20d']['sessions'],20)
            def stocks(view):
                m=result['views'][view];return {s['code']:s for f in m['files'] for s in json.loads((target/'flow-ranks'/m['generation']/f).read_text(encoding='utf-8'))}
            latest=stocks('latest')
            a,b,c=latest['000001'],latest['000002'],latest['000003']
            self.assertEqual((a['pension']['quiet_3m'],a['pension']['first_buy'],a['pension']['signal']),(True,True,True))
            self.assertEqual((b['pension']['quiet_3m'],b['pension']['signal']),(False,False))
            self.assertEqual(c['pension']['quiet_3m'],False)
            self.assertEqual(result['views']['latest']['previous_as_of'],prev)
            self.assertEqual(c['previous_score_rank'],1);self.assertGreater(c['score_rank'],1);self.assertLess(c['rank_change'],0)
            self.assertEqual(a['pension_score'],round((a['components']['연기금 등:absolute']['points']+a['components']['연기금 등:relative']['points'])*4,4))
            self.assertEqual(result['views']['latest']['pension_coverage'],'complete')
            source=Path(__file__).resolve().parents[1]/'scripts/verify-flow-ranks.py'
            spec=importlib.util.spec_from_file_location('verify_ranks',source);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
            self.assertEqual(module.verify(target)['20d']['sessions'],20)
