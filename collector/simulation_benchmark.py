"""Cash-flow matched price-index benchmark and fixed-horizon selection returns."""
from collections import Counter
from statistics import mean
import math
from .simulation import price_problem


def index_price(row, field):
    v = row.get(field) if row else None
    return v if isinstance(v,(int,float)) and math.isfinite(v) and v > 0 else None


def benchmark_market(t, mode):
    return t['market'] if mode == 'market' else 'KOSPI'


def fixed_outcome(t, history, sessions, indices, mode, horizon):
    empty = dict(status='pending', stock_return=None,index_return=None,excess_pp=None,end_date=None)
    if not t['entry_date'] or not t['entry_price']:
        return dict(empty,status='not_entered')
    start = sessions.index(t['entry_date'])
    end = start+horizon-1
    if end >= len(sessions): return empty
    market = benchmark_market(t,mode)
    prices = indices.get(market,{})
    opening = index_price(prices.get(t['entry_date']),'open')
    closing = index_price(prices.get(sessions[end]),'close')
    if not opening or not closing:
        return dict(empty,status='index_missing',end_date=sessions[end])
    previous = history.get(sessions[start-1]) if start else None
    for day in sessions[start:end+1]:
        row = history.get(day)
        if price_problem(previous,row):
            return dict(empty,status='stock_missing',end_date=sessions[end])
        previous = row
    stock_return = (history[sessions[end]]['close']/t['entry_price']-1)*100
    index_return = (closing/opening-1)*100
    return dict(status='complete',stock_return=stock_return,index_return=index_return,
        excess_pp=stock_return-index_return,end_date=sessions[end])


def add_benchmark(result, histories, sessions, dataset, mode='kospi'):
    if mode not in ('kospi','market'): raise ValueError('Invalid benchmark mode')
    indices = {k:v['prices'] for k,v in dataset.get('indices',{}).items()}
    trades = result['trades']
    horizon_summaries = []
    for horizon in (5,10,20):
        for t in trades:
            t.setdefault('horizons',{})[str(horizon)] = fixed_outcome(t,histories[t['code']],sessions,indices,mode,horizon)
        paired = [t['horizons'][str(horizon)] for t in trades if t['horizons'][str(horizon)]['status']=='complete']
        counts = Counter(t['horizons'][str(horizon)]['status'] for t in trades)
        horizon_summaries.append(dict(days=horizon,count=len(paired),counts=dict(counts),
            stock_return=mean(p['stock_return'] for p in paired) if paired else None,
            index_return=mean(p['index_return'] for p in paired) if paired else None,
            excess_pp=mean(p['excess_pp'] for p in paired) if paired else None,
            outperform_count=sum(p['excess_pp']>0 for p in paired),
            outperform_pct=sum(p['excess_pp']>0 for p in paired)/len(paired)*100 if paired else None))
    paired,excluded = [],[]
    for t in trades:
        market = benchmark_market(t,mode)
        prices = indices.get(market,{})
        opening = index_price(prices.get(t['entry_date']),'open')
        closing = index_price(prices.get(sessions[-1]),'close')
        t['benchmark_market'] = market
        t['benchmark_pnl'] = None
        if t['pnl'] is None or not t['invested']:
            excluded.append(dict(code=t['code'],name=t['name'],reason=t['reason']))
            continue
        if not opening or not closing:
            excluded.append(dict(code=t['code'],name=t['name'],reason='기준 지수의 진입 시가 또는 최신 종가 미확인'))
            continue
        pnl = t['invested']*(closing/opening-1)
        t['benchmark_pnl'] = pnl
        paired.append(t)
    allocated = sum(t['budget'] for t in paired)
    invested = sum(t['invested'] for t in paired)
    stock_pnl = sum(t['pnl'] for t in paired)
    index_pnl = sum(t['benchmark_pnl'] for t in paired)
    curve = []
    for day in sessions:
        if day<result['first_date']: continue
        strategy,reference = 0,0
        count,missing = 0,0
        for t in paired:
            if t['entry_date'] > day: continue
            market = benchmark_market(t,mode)
            prices = indices.get(market,{})
            closing = index_price(prices.get(day),'close')
            if not closing:
                missing += 1; continue
            # Closed stock proceeds remain cash, while the index lot stays invested.
            if t['status'] in ('take','stop') and t['exit_date'] <= day:
                stock_value = t['pnl']
            else:
                r = histories[t['code']].get(day)
                if not r or not r.get('close'):
                    missing += 1; continue
                stock_value = t['shares']*(r['close']-t['entry_price'])
            strategy += stock_value
            reference += t['invested']*(closing/index_price(prices.get(t['entry_date']),'open')-1)
            count += 1
        curve.append(dict(date=day,strategy_pnl=strategy if not missing else None,
            benchmark_pnl=reference if not missing else None,missing=missing,count=count))
    result['benchmark'] = dict(mode=mode,label='시장별 지수' if mode=='market' else 'KOSPI',
        source=dataset.get('source'),collected_at=dataset.get('collected_at'),
        source_urls={k:v.get('url') for k,v in dataset.get('indices',{}).items()},
        index_as_of=dataset.get('as_of'),count=len(paired),excluded=excluded,
        allocated=allocated,invested=invested,idle_cash=allocated-invested,
        strategy_pnl=stock_pnl if paired else None,index_pnl=index_pnl if paired else None,
        extra_pnl=stock_pnl-index_pnl if paired else None,
        strategy_return=stock_pnl/allocated*100 if allocated else None,
        index_return=index_pnl/allocated*100 if allocated else None,
        excess_pp=(stock_pnl-index_pnl)/allocated*100 if allocated else None,
        curve=curve,horizons=horizon_summaries)
    return result
