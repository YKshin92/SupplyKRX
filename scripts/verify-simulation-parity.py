"""Local/private parity fixtures. Outputs must never enter the public repository."""
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from collector.simulation import load_histories,simulate
from collector.simulation_portfolio import simulate_portfolio
from collector.simulation_benchmark import add_benchmark
h,f=load_histories(ROOT/'data/live/daily',include_foreign=True)
d=json.loads((ROOT/'public/data/live/simulation-input.json').read_text(encoding='utf-8'))
indices=json.loads((ROOT/'data/live/simulation-indices.json').read_text(encoding='utf-8'))
fixtures=[]
for mode,initial,take,start in [('capital',20_000_000,15,d['sessions'][0]),('capital',30_000_000,30,d['sessions'][0]),('capital',40_000_000,30,'2026-09-01'),('capital',20_000_000,15,'2026-10-04'),('unlimited',20_000_000,30,d['sessions'][0])]:
    s=dict(mode=mode,initial=initial,budget=3_000_000,take=take,stop=10,start=start)
    if mode=='capital':r=simulate_portfolio(h,f,d['sessions'],indices,initial=initial,budget=s['budget'],take=take,stop=10,start_date=start)
    else:
        r=simulate(h,d['sessions'],budget=s['budget'],take=take,stop=10,start_date=start);add_benchmark(r,h,d['sessions'],indices)
    fixtures.append(dict(settings=s,trades=r['trades'],account=r.get('account'),summary=r['summary'],benchmark=r['benchmark']))
(ROOT/'work/simulation-parity.json').write_text(json.dumps(fixtures,ensure_ascii=False,allow_nan=False),encoding='utf-8')
print('Wrote private parity fixtures:',len(fixtures))
