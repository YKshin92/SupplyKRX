import json,tempfile,unittest
from pathlib import Path
from datetime import date,timedelta
from collector.backfill_investors import backfill,windows,audit_day,TARGETS,preserved_digest
from collector.core import upsert,load_rows,save_json
from collector.metadata_snapshots import write_snapshots

def row(day,investor,code='000001',market='KOSPI'):
    return dict(date=day,code=code,name='Fixture',market=market,investor=investor,scope='KRX',buy=100,sell=20,net=80,buy_volume=None,sell_volume=None,net_volume=None,open=100,high=110,low=90,close=100,change_pct=0,volume=100,turnover=10000,source='unit-test',collected_at='2026-10-28T09:00:00Z',finality='unknown')

def context(days):
    instruments={d:{c:dict(market_cap=10000,metadata_date=d,metadata_source='fixture') for c in ('000001','000002')} for d in days}
    universes={d:dict(as_of=d,classification_observed_date='2026-10-28',classification_status='historical_classification_unverified' if d<'2026-10-28' else 'asof_observed',source='fixture',stocks=[dict(code='000001',market='KOSPI'),dict(code='000002',market='KOSDAQ')]) for d in days}
    return dict(metadata_snapshots=instruments,universe_snapshots=universes,price_quality_issues=[])

def batch(days,investors=TARGETS):
    return [row(d,i,c,m) for d in days for i in investors for c,m in [('000001','KOSPI'),('000002','KOSDAQ')]]

class BackfillTests(unittest.TestCase):
    def test_chunks_cannot_hit_twenty_session_truncation(self):
        days=[(date(2026,7,28)+timedelta(days=i)).isoformat() for i in range(93) if (date(2026,7,28)+timedelta(days=i)).weekday()<5]
        chunks=list(windows(days))
        self.assertEqual([d for b in chunks for d in b],days)
        self.assertTrue(all(len(b)<=15 and (date.fromisoformat(b[-1])-date.fromisoformat(b[0])).days<=20 for b in chunks))

    def test_backfill_reuses_valid_days_and_preserves_existing_prices_calendar(self):
        days=['2026-09-01','2026-09-02','2026-09-03'];base=Path('work/test-backfill');base.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as tmp:
            root=Path(tmp);raw=root/'data/live'
            upsert(raw,batch(days,('연기금 등','외국인'))+batch([days[1]]))
            c=context([days[1]]);write_snapshots(raw,c['metadata_snapshots'],'fixture',c['universe_snapshots'])
            calendar=dict(sessions=days,checked_through=days[-1],source='fixture',instruments={'latest':'preserve me'})
            save_json(raw/'calendar.json',calendar);before=(raw/'calendar.json').read_bytes();original=preserved_digest(load_rows(raw));calls=[]
            def provider(end,days,start,investors):
                self.assertEqual(days,20);self.assertEqual(tuple(investors),TARGETS);calls.append((start,end))
                # Includes an already complete interior date; it must not be rewritten.
                return batch(['2026-09-01','2026-09-02','2026-09-03']),context(['2026-09-01','2026-09-02','2026-09-03'])
            report=backfill(root,days[0],days[-1],provider)
            self.assertEqual(report['collected_sessions'],2);self.assertEqual(report['reused_sessions'],1);self.assertEqual(report['rows'],12)
            self.assertEqual(preserved_digest(load_rows(raw)),original);self.assertEqual((raw/'calendar.json').read_bytes(),before)
            self.assertEqual(len(load_rows(raw)),24)
            def never(*a,**k):self.fail('Completed backfill fetched again')
            self.assertEqual(backfill(root,days[0],days[-1],never)['collected_sessions'],0)

    def test_missing_market_and_wrong_investor_fail_without_synthetic_rows(self):
        day='2026-09-01';c=context([day]);snapshot=dict(as_of=day,instruments=c['metadata_snapshots'][day],universe=c['universe_snapshots'][day])
        with self.assertRaises(ValueError):audit_day(batch([day])[:-1],snapshot,day)
        with self.assertRaises(ValueError):audit_day(batch([day])+batch([day])[:1],snapshot,day)
        with self.assertRaises(ValueError):audit_day([dict(r,buy=0,sell=0,net=0) for r in batch([day])],snapshot,day)
        base=Path('work/test-backfill');base.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as tmp:
            root=Path(tmp);save_json(root/'data/live/calendar.json',dict(sessions=[day],checked_through=day))
            with self.assertRaises(ValueError):backfill(root,day,day,lambda *a,**k:(batch([day])+batch([day],('연기금 등',)),c))
            self.assertFalse((root/'data/live/daily'/f'{day}.csv').exists())
