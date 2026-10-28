import json,tempfile,unittest
from pathlib import Path
from datetime import datetime,timezone
from collector.core import upsert,save_json
from collector.investors import INVESTORS
from collector.metadata_snapshots import write_snapshots
from collector.publish_flow_ranks import publish_ranks
from collector.score_snapshots import freeze_scores,read_snapshot,research_report
from test_investor_extension import row

class ScoreObservationTests(unittest.TestCase):
    def fixture(self,root):
        raw=root/'data/live';days=['2026-07-01','2026-07-28','2026-10-28']
        upsert(raw,[row(i,d) for d in days for i in INVESTORS]);save_json(raw/'calendar.json',dict(sessions=days,checked_through=days[-1],source='fixture'))
        meta={'000001':dict(market_cap=1000,metadata_date=days[-1],metadata_source='fixture')}
        u=dict(as_of=days[-1],classification_observed_date=days[-1],classification_status='asof_observed',source='fixture',stocks=[dict(code='000001',market='KOSPI',name='Fixture')])
        write_snapshots(raw,{days[-1]:meta},'fixture',{days[-1]:u});publish_ranks(root,root/'web')
        return raw
    def test_immutable_idempotent_versions_and_no_early_performance_claim(self):
        base=Path('work/test-score-observations');base.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as tmp:
            root=Path(tmp);raw=self.fixture(root);clock=datetime(2026,10,28,12,tzinfo=timezone.utc)
            first=freeze_scores(root,root/'web',clock);self.assertTrue(first['created']);self.assertEqual(first['capture_kind'],'same_day_after_close')
            p=raw/'score-snapshots'/first['as_of']/first['generation']/'snapshot.json';original=p.read_bytes()
            again=freeze_scores(root,root/'web',datetime(2026,10,29,12,tzinfo=timezone.utc));self.assertFalse(again['created']);self.assertEqual(p.read_bytes(),original);self.assertEqual(again['captured_at'],first['captured_at'])
            upsert(raw,[row('사모','2026-10-28',net=300)]);publish_ranks(root,root/'web');second=freeze_scores(root,root/'web',datetime(2026,10,28,13,tzinfo=timezone.utc))
            self.assertNotEqual(second['generation'],first['generation']);self.assertEqual(p.read_bytes(),original)
            r=research_report(root,root/'web');self.assertEqual(r['snapshot_versions'],2);self.assertEqual(r['snapshot_days'],1);self.assertEqual(r['same_day_capture_days'],1);self.assertEqual(r['mature_20_session_days'],0);self.assertFalse(r['performance_evaluated']);self.assertFalse(r['strategy_applied'])
            part=p.parent/first['parts'][0]['file'];part.write_bytes(b'corrupt')
            with self.assertRaises(ValueError):read_snapshot(p)
    def test_late_capture_cannot_become_a_forward_sample_and_future_is_rejected(self):
        base=Path('work/test-score-observations');base.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as tmp:
            root=Path(tmp);self.fixture(root)
            with self.assertRaises(ValueError):freeze_scores(root,root/'web',datetime(2026,10,27,12,tzinfo=timezone.utc))
            self.assertEqual(freeze_scores(root,root/'web',datetime(2026,10,28,0,tzinfo=timezone.utc))['state'],'unavailable')
            late=freeze_scores(root,root/'web',datetime(2026,10,29,12,tzinfo=timezone.utc));self.assertEqual(late['capture_kind'],'late_or_unverified_capture')
            self.assertEqual(research_report(root,root/'web')['same_day_capture_days'],0)
    def test_outcomes_and_escaping_paths_cannot_enter_observations(self):
        base=Path('work/test-score-observations');base.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as tmp:
            root=Path(tmp);self.fixture(root);m=json.loads((root/'web/flow-ranks/3m.json').read_text(encoding='utf-8'));p=root/'web/flow-ranks'/m['generation']/m['files'][0]
            stocks=json.loads(p.read_text(encoding='utf-8'));stocks[0]['future_return']=30;save_json(p,stocks)
            with self.assertRaises(ValueError):freeze_scores(root,root/'web',datetime(2026,10,28,12,tzinfo=timezone.utc))
            m['files']=['../private.json'];save_json(root/'web/flow-ranks/3m.json',m)
            with self.assertRaises(ValueError):freeze_scores(root,root/'web',datetime(2026,10,28,12,tzinfo=timezone.utc))
