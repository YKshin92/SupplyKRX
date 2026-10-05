import unittest
import json
from pathlib import Path
from contextlib import contextmanager
from uuid import uuid4

@contextmanager
def TemporaryDirectory():
    # Ordinary workspace directories also work under restricted Windows ACLs.
    target=Path('work/test-runs')/uuid4().hex
    target.mkdir(parents=True)
    yield str(target)
from collector.core import validate,upsert,load_rows,metrics,publish

def row(day='2026-09-01',net=10,**kwargs):
    r=dict(date=day,code='005930',name='삼성전자',market='KOSPI',investor='연기금 등',scope='KRX',buy=100+(net or 0),sell=100,net=net,buy_volume=None,sell_volume=None,net_volume=None,close=70000,change_pct=0,volume=10,turnover=1000,source='unit-test',collected_at='2026-09-01T20:00:00+09:00',finality='unknown')
    r.update(kwargs)
    return r

class CoreTests(unittest.TestCase):
    def test_code_and_identity(self):
        self.assertEqual(validate(row())['code'],'005930')
        self.assertEqual(validate(row(code='0001A0'))['code'],'0001A0')
        with self.assertRaises(ValueError):validate(row(code='5930'))
        with self.assertRaises(ValueError):validate(row(net=4,buy=105))
    def test_missing_not_zero(self):
        r=validate(row(buy=None,sell=None,net=None))
        self.assertIsNone(r['net'])
        self.assertEqual(validate(row(buy=10,sell=10,net=None))['net'],0)
    def test_nonfinite_and_negative(self):
        for patch in [dict(buy=float('nan')),dict(turnover=-1),dict(close=1.5)]:
            with self.assertRaises(ValueError):validate(row(**patch))
    def test_complete_and_missing_sessions(self):
        ds=['2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-07']
        rows=[row(d,10) for d in ds]
        self.assertEqual(metrics(rows,ds,ds[-1])['sum5'],50)
        self.assertTrue(metrics(rows,ds,ds[-1])['streak_censored'])
        del rows[2]
        out=metrics(rows,ds,ds[-1])
        self.assertIsNone(out['sum5']);self.assertIsNone(out['streak'])
    def test_zero_breaks_streak_but_is_activity(self):
        out=metrics([row(net=0)],['2026-09-01'],'2026-09-01')
        self.assertEqual(out['streak'],0);self.assertTrue(out['active'])
        out=metrics([row(net=0,buy=None,sell=None)],['2026-09-01'],'2026-09-01')
        self.assertIsNone(out['active'])
    def test_twenty_day_ratio(self):
        ds=[f'2026-09-{i:02}' for i in range(1,21)]
        rows=[row(d,10) for d in ds]
        out=metrics(rows,ds,ds[-1]);self.assertEqual(out['sum20'],200);self.assertEqual(out['ratio20'],1)
        rows[4]['turnover']=0
        self.assertAlmostEqual(metrics(rows,ds,ds[-1])['ratio20'],200/19000*100)
        for r in rows:r['turnover']=0
        self.assertIsNone(metrics(rows,ds,ds[-1])['ratio20'])
    def test_upsert_correction_and_duplicate(self):
        with TemporaryDirectory() as t:
            root=Path(t)
            upsert(root,[row()]);upsert(root,[row(net=20)])
            self.assertEqual(len(load_rows(root)),1);self.assertEqual(load_rows(root)[0]['net'],20)
            with self.assertRaises(ValueError):upsert(root,[row(),row()])
            self.assertEqual(load_rows(root)[0]['net'],20)
    def test_failed_validation_preserves_manifest(self):
        with TemporaryDirectory() as t:
            root=Path(t)/'raw';target=Path(t)/'public'
            upsert(root,[row()])
            cal=dict(sessions=['2026-09-01'],checked_through='2026-09-02',source='test')
            publish(root,target,'live',cal)
            before=(target/'manifest.json').read_bytes()
            with self.assertRaises(ValueError):upsert(root,[row(net=4,buy=105)])
            self.assertEqual(before,(target/'manifest.json').read_bytes())
    def test_missing_refresh_preserves_existing_rows(self):
        with TemporaryDirectory() as t:
            root=Path(t)
            upsert(root,[row()])
            with self.assertRaises(ValueError):upsert(root,[row(buy=None,sell=None,net=None)])
            self.assertEqual(load_rows(root)[0]['net'],10)
    def test_no_demo_in_live(self):
        with TemporaryDirectory() as t:
            root=Path(t)
            upsert(root,[row(finality='demo')])
            with self.assertRaises(ValueError):publish(root,root/'web','live',dict(sessions=['2026-09-01'],checked_through='2026-09-01',source='test'))

if __name__=='__main__': unittest.main()
