import gzip
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('detail6m', ROOT / 'scripts/publish-detail-6m.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
HEAD = 'date,code,name,market,investor,scope,buy,sell,net,buy_volume,sell_volume,net_volume,close,change_pct,volume,turnover,source,collected_at,finality,open,high,low,flow_status\n'


def line(day, code, investor, net):
    buy, sell = max(net, 0), max(-net, 0)
    return f'{day},{code},종목,KOSPI,{investor},KRX,{buy},{sell},{net},1,1,0,100,0.5,10,1000,KRX via pykrx,2026-10-31T08:00:00+00:00,unknown,99,101,98,reported\n'


class Detail6mTests(unittest.TestCase):
    def test_live_wins_backfill_fills_earlier_days_and_history_stocks_are_skipped(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, target = Path(tmp) / 'root', Path(tmp) / 'target'
            (root / 'data/live/daily').mkdir(parents=True); (root / 'data/live/detail-backfill').mkdir(parents=True); target.mkdir()
            (root / 'data/live/calendar.json').write_text(json.dumps(dict(sessions=['2026-10-29', '2026-10-30'])), encoding='utf-8')
            for day, net in (('2026-03-02', 5), ('2026-05-04', 6), ('2026-10-29', 7)):  # 2026-10-29 also in live
                with gzip.open(root / f'data/live/detail-backfill/{day}.csv.gz', 'wt', encoding='utf-8') as f:
                    f.write(HEAD + line(day, '000001', '연기금 등', net) + line(day, '000001', '외국인', -net) + line(day, '000002', '연기금 등', net))
            for day, net in (('2026-10-29', 70), ('2026-10-30', 80)):
                (root / f'data/live/daily/{day}.csv').write_text(HEAD + line(day, '000001', '연기금 등', net) + line(day, '000001', '외국인', 1) + line(day, '000002', '연기금 등', net), encoding='utf-8')
            (target / 'history-stock-000002.json').write_text('{}', encoding='utf-8')
            report = module.build(root, target)
            self.assertEqual((report['start'], report['written'], report['missing']), ('2026-04-30', 1, []))
            d = json.loads((target / 'detail-6m/000001.json').read_text(encoding='utf-8'))
            self.assertEqual([(r['date'], r['net']) for r in d['pension']], [('2026-05-04', 6), ('2026-10-29', 70), ('2026-10-30', 80)])
            self.assertEqual([r['net'] for r in d['foreign']], [-6, 1, 1])
            self.assertFalse((target / 'detail-6m/000002.json').exists())


if __name__ == '__main__':
    unittest.main()
