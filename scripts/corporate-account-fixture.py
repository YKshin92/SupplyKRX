"""Synthetic bonus + spinoff account fixture, shared with the TypeScript parity test."""
import json
from datetime import date,timedelta
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from collector.simulation_portfolio import simulate_portfolio,entry_score

days=[(date(2026,9,1)+timedelta(days=i)).isoformat() for i in range(22)]
def bar(o,h,l,c,v=100):return dict(open=o,high=h,low=l,close=c,volume=v,change_pct=None)
def flat(price):return {d:bar(price,price,price,price) for d in days}
quotes={'000001':flat(10_000),'000002':flat(10_000),'000003':flat(1_400_000),'00000N':{}}
# Bonus 1/7 per share: ex day 13 (theoretical 8,750), stop gap on day 15, listing on day 18.
quotes['000001'].update({days[i]:bar(8_750,8_800,8_700,8_750) for i in range(13,15)})
quotes['000001'].update({days[i]:bar(7_500,7_600,7_400,7_500) for i in range(15,22)})
# Spinoff 0.9 retained + 1 new: halt days 13-14, resume day 15, joint take decided at day 18 close.
for i in (13,14):quotes['000002'][days[i]]=bar(None,None,None,10_000,0)
quotes['000002'].update({days[15]:bar(8_000,8_100,7_900,8_000),days[16]:bar(8_100,8_300,8_000,8_200),days[17]:bar(8_300,8_400,8_200,8_300)})
quotes['000002'].update({days[i]:bar(8_400,8_500,8_300,8_400) for i in range(18,22)})
quotes['00000N'].update({days[15]:bar(3_000,3_100,2_900,3_000),days[16]:bar(3_700,3_900,3_600,3_800),days[17]:bar(4_800,5_000,4_700,4_900)})
quotes['00000N'].update({days[i]:bar(6_000,6_100,5_900,6_000) for i in range(18,22)})
signals={'000001':10,'000002':10,'000003':12}
histories={};foreign={};stocks=[]
for code,rows in quotes.items():
    histories[code]={d:dict(date=d,code=code,name=code,market='KOSPI',buy=0,sell=0,net=0,flow_status='reported',**rows[d]) for d in rows}
    foreign[code]={d:dict(buy=0,net=0) for d in rows}
    if code in signals:
        i=signals[code];histories[code][days[i]].update(buy=400_000_000,net=400_000_000)
        score=entry_score(histories[code][days[i]],foreign[code][days[i]])['total']
        stocks.append(dict(code=code,name=code,market='KOSPI',signals=[dict(index=i,net=400_000_000,score=score,absent=0)],prices=[{k:histories[code][d][k] for k in ('open','high','low','close','volume','change_pct')} for d in days]))
corporate=dict(as_of=days[-1],actions=[
    dict(code='000001',id='syn-bonus',kind='bonus',known_on=days[5],ex_date=days[13],listing_date=days[18],numerator=1,denominator=7,fraction_policy='zero',evidence_on=days[18],source='https://example.test/synthetic-only'),
    dict(code='000002',id='syn-spin',kind='spinoff',known_on=days[5],halt_start=days[13],resume_date=days[15],numerator=9,denominator=10,new_code='00000N',new_name='신설',new_numerator=1,new_denominator=1,fraction_policy='zero',evidence_on=days[15],source='https://example.test/synthetic-only')])
assets={'00000N':[{k:histories['00000N'][d][k] for k in ('open','high','low','close','volume','change_pct')} if d in histories['00000N'] else None for d in days]}
indices=dict(indices={'KOSPI':dict(prices={d:dict(open=100,close=100) for d in days})})
settings=dict(mode='capital',initial=4_000_000,budget=2_000_000,take=30,stop=10,start=days[0])
result=simulate_portfolio(histories,foreign,days,indices,initial=settings['initial'],budget=settings['budget'],corporate=corporate)
by={t['code']:t for t in result['trades']}
bonus,spin,late=by['000001'],by['000002'],by['000003']
assert bonus['status']=='stop' and bonus['shares']==228 and bonus['exit_date']==days[18] and bonus['pnl']==-290_000,bonus
assert bonus['fractional_forfeit']==[dict(asset='무상배정 신주',fraction='4/7')]
assert spin['status']=='take' and spin['exit_date']==days[19] and spin['pnl']==712_000 and [l['shares'] for l in spin['corporate_legs']]==[180,200],spin
assert late['entry_date']==days[16],late  # first proceeds on day 15 fund the waiting order on day 16, not the same day
assert all(r['equity'] is not None for r in result['account']['ledger'][11:13]+result['account']['ledger'][15:])
assert result['account']['ledger'][13]['equity'] is None  # halted spinoff value stays unknown
assert result['account']['equity'] is not None and result['account']['unknown_cost']==0
keys=['code','status','reason','entry_date','exit_date','entry_price','exit_price','shares','invested','pnl','return_pct','fractional_forfeit','corporate_phase']
ledger_keys=['date','end_cash','sale_proceeds','equity','unknown_cost']
print(json.dumps(dict(data=dict(version=1,sessions=days,stocks=stocks,corporate_assets=assets,indices={'KOSPI':[dict(open=100,close=100) for _ in days]},source={}),settings=settings,corporate=corporate,
    expected=dict(trades=[{k:t.get(k) for k in keys} for t in result['trades']],ledger=[{k:r[k] for k in ledger_keys} for r in result['account']['ledger']])),ensure_ascii=False))
