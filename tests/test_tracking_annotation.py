import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('tracking_annotation',ROOT/'scripts/annotate-tracking-outcomes.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class TrackingAnnotationTests(unittest.TestCase):
    def test_legacy_overlaid_simulation_is_enriched_without_quote_changes(self):
        base=ROOT/'work/test-tracking-annotation';base.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as tmp:
            target=Path(tmp);p=target/'simulation-input.json'
            original=dict(version=1,sessions=['2026-10-23'],stocks=[],stock_files=['simulation-stocks-000.json'])
            p.write_text(json.dumps(original),encoding='utf-8')
            self.assertEqual(module.enrich(target),0)
            result=json.loads(p.read_text(encoding='utf-8'))
            self.assertEqual(result['corporate_reconciliation']['actions'][0]['resume_date'],'2024-10-08')
            for k,v in original.items():self.assertEqual(result[k],v)
            self.assertEqual(module.enrich(target),0)
            self.assertEqual(result,json.loads(p.read_text(encoding='utf-8')))
            original['sessions']=['2026-01-01'];p.write_text(json.dumps(original),encoding='utf-8')
            module.enrich(target)
            self.assertIsNone(json.loads(p.read_text(encoding='utf-8'))['corporate_reconciliation'])
    def test_history_and_fallback_are_resharded_after_annotation_and_repeat_safely(self):
        base=ROOT/'work/test-tracking-annotation';base.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as tmp:
            target=Path(tmp);days=[f'{i:03}' for i in range(30)]
            history=[dict(date=d,open=100,high=100,low=100,close=100,volume=100,change_pct=0) for d in days]
            (target/'history-stock-000001.json').write_text(json.dumps(dict(pension=history,foreign=[dict(date=d,net=0) for d in days])),encoding='utf-8')
            events=[dict(id=f'000001:{d}',code='000001',signal_date=d,current_close=100,signal_close=100,current_return=0) for d in days[20:]]
            for root in ('tracking-history','tracking-events'):
                (target/f'{root}.json').write_text(json.dumps(dict(schema_version=1,as_of=days[-1],sessions=days,events=events)),encoding='utf-8')
            self.assertEqual(module.enrich(target,1200),20)
            for root in ('tracking-history','tracking-events'):
                manifest=json.loads((target/f'{root}.json').read_text(encoding='utf-8'))
                self.assertEqual(manifest['events'],[])
                self.assertGreater(len(manifest['files']),1)
                parts=[target/f for f in manifest['files']]
                self.assertTrue(all(p.stat().st_size<=1200 for p in parts))
                actual=[e for p in parts for e in json.loads(p.read_text(encoding='utf-8'))]
                self.assertEqual([e['id'] for e in actual],[e['id'] for e in events])
                self.assertTrue(all(e['current_return']==0 for e in actual))
            self.assertEqual(module.enrich(target,1200),20)
