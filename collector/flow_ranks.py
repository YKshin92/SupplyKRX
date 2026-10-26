"""Cross-sectional flow ranks over an explicit, unfiltered as-of universe."""
import math
from collections import defaultdict
from datetime import date
import re
from .investors import INVESTORS,INCLUSION_NOTE


def finite(value):
    return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value)


def rank_flows(rows,sessions,as_of,universe,metadata):
    days=sorted(set(sessions))
    if not days or days[-1]!=as_of or len(days)!=len(sessions):raise ValueError('Invalid rank sessions')
    if any(date.fromisoformat(d).isoformat()!=d for d in days):raise ValueError('Invalid rank date')
    eligible={item['code']:item['market'] for item in universe}
    if len(eligible)!=len(universe) or not eligible:raise ValueError('Invalid rank universe')
    if any(not re.fullmatch(r'[0-9A-Z]{6}',code) for code in eligible):raise ValueError('Invalid universe code')
    if any(m not in ('KOSPI','KOSDAQ') for m in eligible.values()):raise ValueError('Invalid universe market')
    history={};day_set=set(days)
    for row in rows:
        if row['code'] not in eligible or row['date'] not in day_set or row['investor'] not in INVESTORS:continue
        if row['market']!=eligible[row['code']]:raise ValueError('Universe market mismatch')
        key=(row['code'],row['investor'],row['date'])
        if key in history:raise ValueError('Duplicate flow observation')
        if row['net'] is not None and not finite(row['net']):raise ValueError('Invalid net amount')
        history[key]=row['net']
    stocks={code:dict(code=code,market=market,components={},score=None,known_points=0) for code,market in eligible.items()}
    coverage={}
    for investor in INVESTORS:
        absolute={};relative={}
        for code in eligible:
            values=[history.get((code,investor,day)) for day in days]
            net=sum(values) if all(v is not None for v in values) else None
            cap=metadata.get(code,{})
            if cap and cap.get('metadata_date')!=as_of:raise ValueError('Market-cap date mismatch')
            capital=cap.get('market_cap')
            ratio=net/capital*100 if net is not None and finite(capital) and capital>0 else None
            for kind,value in [('absolute',net),('relative',ratio)]:
                key=investor+':'+kind
                stocks[code]['components'][key]=dict(value=value,rank=None,population=0,points=None,observations=sum(v is not None for v in values))
            if net is not None:absolute[code]=net
            if ratio is not None:relative[code]=ratio
        for kind,values in [('absolute',absolute),('relative',relative)]:
            key=investor+':'+kind;n=len(values);groups=defaultdict(list)
            for code,value in values.items():groups[value].append(code)
            position=1
            for value,codes in sorted(groups.items(),reverse=True):
                rank=position+(len(codes)-1)/2
                percentile=100*(n-rank)/(n-1) if n>1 else 100
                for code in codes:
                    part=stocks[code]['components'][key]
                    part.update(rank=rank,points=12.5*percentile/100 if value>0 else 0)
                position+=len(codes)
            for stock in stocks.values():stock['components'][key]['population']=n
            coverage[key]=dict(eligible=len(eligible),ranked=n,missing=len(eligible)-n)
    for stock in stocks.values():
        points=[p['points'] for p in stock['components'].values()]
        stock['known_points']=sum(p for p in points if p is not None)
        if all(p is not None for p in points):stock['score']=stock['known_points']
    return dict(version='flow-rank-equal8-v1',as_of=as_of,first_date=days[0],sessions=len(days),population=len(eligible),market_cap_date=as_of,
                weighting='8항목 동일12.5점 · 검증 전 비교 가설',note=INCLUSION_NOTE,coverage=coverage,stocks=list(stocks.values()))
