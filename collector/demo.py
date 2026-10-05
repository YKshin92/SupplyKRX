"""Deterministic synthetic fixtures. Never marketed as market observations."""
from datetime import date, timedelta
import math
from pathlib import Path
from .core import upsert, publish, save_json

def generate(project: Path):
    sessions = []
    d = date(2026, 8, 31)
    while len(sessions) < 20:
        if d.weekday() < 5: sessions.append(d.isoformat())
        d += timedelta(days=1)
    instruments = [('005930','삼성전자','KOSPI',72000),('000660','SK하이닉스','KOSPI',185000),('035420','NAVER','KOSPI',210000),('005380','현대차','KOSPI',225000),('373220','LG에너지솔루션','KOSPI',360000),('068270','셀트리온','KOSPI',175000),('005490','POSCO홀딩스','KOSPI',320000),('000270','기아','KOSPI',110000),('247540','에코프로비엠','KOSDAQ',180000),('086520','에코프로','KOSDAQ',80000),('196170','알테오젠','KOSDAQ',260000),('035900','JYP Ent.','KOSDAQ',65000)]
    rows = []
    for j,(code,name,market,price) in enumerate(instruments):
        previous = price
        for i,day in enumerate(sessions):
            net = round((math.sin(i*.55+j)*22 + (14-j*2.2) + (i*.5 if j<2 else 0))*1e8)
            sell = round((25+abs(math.cos(i+j))*30)*1e8)
            buy = max(0,sell+net)
            if j==11 and i==19: buy=sell=900000000 # real activity, net zero
            close=round(price*(1+.0015*i+math.sin(i*.4+j)*.035)/100)*100
            rows.append(dict(date=day,code=code,name=name,market=market,investor='연기금 등',scope='DEMO',buy=buy,sell=sell,net=buy-sell,buy_volume=None,sell_volume=None,net_volume=None,open=previous,high=max(previous,close)+500,low=min(previous,close)-500,close=close,change_pct=round((close/previous-1)*100,2),volume=1000000+j*12300,turnover=round(close*(1000000+j*12300)),source='합성 데모 · 실제 매매 아님',collected_at='2026-09-25T20:17:00+09:00',finality='demo'))
            previous=close
    foreign=[]
    for r in rows:
        f={**r,'investor':'외국인','buy':r['sell']*2,'sell':r['buy']}
        f['net']=f['buy']-f['sell']
        foreign.append(f)
    rows+=foreign
    root=project/'data/demo'
    calendar=dict(sessions=sessions,checked_through=sessions[-1],source='합성 데모 거래일 · 실제 휴장일 미반영')
    upsert(root,rows)
    save_json(root/'calendar.json',calendar)
    return publish(root,project/'public/data/demo','demo',calendar)

if __name__ == '__main__':
    print(generate(Path(__file__).resolve().parents[1]))
