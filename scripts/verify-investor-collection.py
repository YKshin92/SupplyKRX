"""Audit an isolated private collection, emitting coverage only, never raw quotes."""
import argparse,json,sys
from collections import defaultdict
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from collector.core import load_rows
from collector.investors import INVESTORS,INCLUSION_NOTE
from collector.metadata_snapshots import validate_snapshots


def verify(root):
    rows=load_rows(root/'data/live')
    if not rows:raise ValueError('No collected rows')
    days=sorted({r['date'] for r in rows});groups=defaultdict(list);coverage=[]
    for r in rows:groups[r['date'],r['market'],r['investor']].append(r)
    for day in days:
        path=root/'data/live/metadata/daily'/f'{day}.json'
        snapshot=json.loads(path.read_text(encoding='utf-8'))
        if snapshot['as_of']!=day:raise ValueError('Snapshot as-of mismatch')
        metadata=snapshot['instruments'];validate_snapshots({day:metadata})
        for market in ('KOSPI','KOSDAQ'):
            universe=None
            for investor in INVESTORS:
                batch=groups[day,market,investor];codes={r['code'] for r in batch}
                if not codes or len(codes)!=len(batch):raise ValueError('Missing/duplicate investor universe')
                if universe is not None and codes!=universe:raise ValueError('Investor universes differ')
                universe=codes
                if any(r['net'] is None for r in batch):raise ValueError('Unconfirmed investor flow')
                if sum(r['buy']+r['sell'] for r in batch)<=0:raise ValueError('Whole investor market response is zero')
                coverage.append(dict(date=day,market=market,investor=investor,stocks=len(codes),reported=sum(r.get('flow_status')=='reported' for r in batch),absent_zero=sum(r.get('flow_status')=='absent_zero' for r in batch),cap_missing=sum(not metadata.get(c,{}).get('market_cap') for c in codes)))
    return dict(first=days[0],as_of=days[-1],sessions=len(days),rows=len(rows),groups=coverage,note=INCLUSION_NOTE)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);parser.add_argument('--report',type=Path,required=True);args=parser.parse_args()
    report=verify(args.root);args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))
