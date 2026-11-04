import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('today_signals', ROOT / 'scripts/today-signals.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
HEAD = 'date,code,name,market,investor,scope,buy,sell,net,buy_volume,sell_volume,net_volume,close,change_pct,volume,turnover,source,collected_at,finality,open,high,low,flow_status\n'


class TodaySignalsTests(unittest.TestCase):
    def test_conditions_match_the_simulation_rules(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root / 'data/live/daily').mkdir(parents=True)
            from datetime import date, timedelta
            days, d = [], date(2026, 6, 1)
            while len(days) < 90:
                if d.weekday() < 5:
                    days.append(d.isoformat())
                d += timedelta(days=1)
            last = days[-1]

            def row(code, buy, sell, vol, o=100, c=100):
                return f'{{d}},{code},{code},KOSPI,연기금 등,KRX,{buy},{sell},{buy - sell},1,1,0,{c},0,{vol},1,KRX,2026-10-31T08:00:00+00:00,unknown,{o},{max(o, c)},{min(o, c)},reported\n'
            for day in days:
                lines = HEAD
                for code, quiet_buy in (('000001', 0), ('000002', 5e7), ('000003', 0), ('000004', 0), ('000005', 0), ('000006', 0)):
                    if day == last:
                        vol = 400 if code == '000004' else 150
                        lines += row(code, int(4e8), 0, vol, o=100, c=97).format(d=day)
                    else:
                        buy = int(quiet_buy) if day == days[-30] else 0
                        # 000005 sold 5천만 within 3 months (allowed, under 1억); 000006 sold 5천만 twice (1억 in total, not allowed)
                        sell = int(5e7) if code in ('000005', '000006') and day == days[-30] or code == '000006' and day == days[-40] else 0
                        lines += row(code, buy, sell, 100).format(d=day)
                (root / f'data/live/daily/{day}.csv').write_text(lines, encoding='utf-8')
            days_, rows = module.load(root)
            found = module.signals(days_, rows, last)
            # 000002 bought within 3 months; 000006 sold 1억 in total within 3 months; 000004 volume 4x;
            # 000001, 000003 and 000005 (5천만 sold, under 1억; excluded by the 11-02 '매도 0원' rule) qualify
            self.assertEqual([s['code'] for s in found], ['000001', '000003', '000005'])
            self.assertEqual(found[0]['candle'], 'bear')
            self.assertEqual(found[0]['volume_ratio'], 1.5)


if __name__ == '__main__':
    unittest.main()
