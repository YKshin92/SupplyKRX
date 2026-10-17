import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('publish_simulation',Path(__file__).resolve().parents[1]/'scripts/publish-simulation.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class PublishSimulationTests(unittest.TestCase):
    def setUp(self):
        self.temp_parent=Path(__file__).resolve().parents[1]/'work/test-simulation'
        self.temp_parent.mkdir(parents=True,exist_ok=True)
    def test_keeps_requalifications_for_custom_start_and_missing_prices(self):
        days=[f'2026-09-{d:02}' for d in range(1,29)]
        h={'000001':{d:dict(date=d,name='Test',market='KOSPI',buy=0,sell=0,net=0,collected_at='2026-09-28',open=100,high=110,low=90,close=100,volume=10) for d in days}}
        for i in (10,22):h['000001'][days[i]].update(buy=3e8,net=3e8)
        h['000001'][days[-1]]['high']=None
        with tempfile.TemporaryDirectory(dir=self.temp_parent) as temp:
            root=Path(temp);live=root/'data/live';live.mkdir(parents=True);(live/'calendar.json').write_text(json.dumps(dict(sessions=days)))
            with patch.object(module,'load_histories',return_value=(h,{})):module.publish(root,root/'out')
            result=json.loads((root/'out/simulation-input.json').read_text(encoding='utf-8'))
            self.assertEqual([s['index'] for s in result['stocks'][0]['signals']],[10,22])
            self.assertIsNone(result['stocks'][0]['signals'][0]['score'])
            self.assertIsNone(result['stocks'][0]['prices'][-1]['high'])
            self.assertEqual(result['indices'],{})

    def test_rejects_whole_missing_trading_day(self):
        with tempfile.TemporaryDirectory(dir=self.temp_parent) as temp:
            root=Path(temp);live=root/'data/live';live.mkdir(parents=True);(live/'calendar.json').write_text(json.dumps(dict(sessions=['2026-09-01','2026-09-02','2026-09-03'])))
            h={'000001':{'2026-09-01':{},'2026-09-03':{}}}
            with patch.object(module,'load_histories',return_value=(h,{})),self.assertRaises(ValueError):module.publish(root,root/'out')
