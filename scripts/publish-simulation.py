"""Generate compact simulation inputs into an authenticated private web target."""
import argparse
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from collector.simulation import load_histories
from collector.simulation_portfolio import entry_score
from collector.corporate_context import published_reconciliation

def publish(root, target):
    h,f=load_histories(root/'data/live/daily',include_foreign=True)
    observed=sorted({d for hist in h.values() for d in hist})
    calendar=json.loads((root/'data/live/calendar.json').read_text(encoding='utf-8'))
    days=[d for d in calendar['sessions'] if observed[0]<=d<=observed[-1]]
    if set(days)-set(observed): raise ValueError('Entire trading day file missing')
    candidates=[]
    for code,hist in sorted(h.items()):
        signals=[]
        for i in range(10,len(days)):
            r=hist.get(days[i]);before=[hist.get(d) for d in days[i-10:i]]
            if not r or r.get('net') is None or r['net']<300_000_000: continue
            if any(not p or any(p.get(k) is None or not 0<=p[k]<100_000_000 for k in ('buy','sell')) for p in before): continue
            signals.append(dict(index=i,net=r['net'],score=entry_score(r,f.get(code,{}).get(days[i],{}))['total'],absent=sum(p.get('flow_status')=='absent_zero' for p in before)))
        if signals:
            r=hist[days[signals[0]['index']]]
            candidates.append(dict(code=code,name=r['name'],market=r['market'],signals=signals,
                prices=[{k:hist.get(d,{}).get(k) for k in ('open','high','low','close','volume','change_pct')} for d in days]))
    p=root/'data/live/simulation-indices.json'
    indices=json.loads(p.read_text(encoding='utf-8')) if p.exists() else {}
    repaired=[r for hist in h.values() for r in hist.values() if r.get('_price_supplement')]
    result=dict(version=1,sessions=days,stocks=candidates,corporate_reconciliation=published_reconciliation(days[-1]),
        indices={k:[v['prices'].get(d) for d in days] for k,v in indices.get('indices',{}).items()},
        source=dict(stocks=len(h),rows=sum(len(hist) for hist in h.values()),
            collected_at=max(r['collected_at'] for hist in h.values() for r in hist.values()),
            repaired_rows=len(repaired),index_as_of=indices.get('as_of'),
            price_source='KRX; verified missing OHLCV supplemented with NAVER Finance'))
    target.mkdir(parents=True,exist_ok=True)
    (target/'simulation-input.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'),allow_nan=False),encoding='utf-8')
    print(f'Simulation: {len(candidates)} candidates, {len(days)} sessions; private target only.')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,default=ROOT);p.add_argument('--target',type=Path,default=ROOT/'public/data/live');a=p.parse_args();publish(a.root,a.target)
