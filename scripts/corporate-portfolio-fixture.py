"""Synthetic account fixture, shared with the TypeScript parity test."""
import json
from datetime import date,timedelta
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from collector.simulation_portfolio import simulate_portfolio,entry_score

days=[(date(2026,9,1)+timedelta(days=i)).isoformat() for i in range(17)]
histories={};foreign={};stocks=[]
for code,buy in [('000001',3_000_000_000),('000002',300_000_000)]:
    rows={d:dict(date=d,code=code,name=code,market='KOSPI',buy=0,sell=0,net=0,open=1_000_000,high=1_050_000,low=950_000,close=1_000_000,volume=100,change_pct=None) for d in days}
    rows[days[10]].update(buy=buy,net=buy)
    if code=='000001':
        for i in (12,13):rows[days[i]].update(open=None,high=None,low=None,volume=0)
        for i in (14,15,16):rows[days[i]].update(open=264000,high=270000,low=260000,close=264000)
    histories[code]=rows
    foreign[code]={d:dict(buy=0,net=0) for d in days}
    score=entry_score(rows[days[10]],foreign[code][days[10]])['total']
    stocks.append(dict(code=code,name=code,market='KOSPI',signals=[dict(index=10,net=buy,score=score,absent=0)],prices=[rows[d] for d in days]))
corporate=dict(as_of=days[-1],actions=[dict(code='000001',id='test-split',known_on=days[10],halt_start=days[12],resume_date=days[14],numerator=5,denominator=1,evidence_on=days[14],source='https://example.test/synthetic-only')])
indices=dict(indices={'KOSPI':dict(prices={d:dict(open=100,close=100) for d in days})})
settings=dict(mode='capital',initial=3_000_000,budget=3_000_000,take=30,stop=10,start=days[0])
result=simulate_portfolio(histories,foreign,days,indices,initial=settings['initial'],budget=settings['budget'],corporate=corporate)
a,b=result['trades']
assert a['entry_price']==1_000_000 and a['shares']==15 and a['pnl']==960_000
assert a['exit_date']==days[14] and b['entry_date']==days[15]
assert result['account']['ledger'][14]['buy_value']==0
assert result['account']['ledger'][12]['equity'] is None
assert result['account']['equity']==3_960_000
assert result['account']['cash']==960_000
keys=['code','status','entry_date','exit_date','entry_price','shares','invested','pnl','return_pct']
ledger_keys=['date','end_cash','buy_value','sale_proceeds','equity','unknown_cost']
print(json.dumps(dict(data=dict(version=1,sessions=days,stocks=stocks,indices={'KOSPI':[dict(open=100,close=100) for _ in days]},source={}),settings=settings,corporate=corporate,expected=dict(trades=[{k:t[k] for k in keys} for t in result['trades']],ledger=[{k:r[k] for k in ledger_keys} for r in result['account']['ledger']]))))
