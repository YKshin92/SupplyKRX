"""Staged split-aware valuation; no ledger mutation or cash credit."""
import math
from .simulation import price_problem


def split_value(position, quote, take=30, stop=10):
    if not all(isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v) for v in (take,stop)) or not 1<=take<=100 or not 1<=stop<=50:
        raise ValueError('Invalid barriers')
    result=dict(status=position['phase'],pnl=None,return_pct=None,exit_price=None,
                confirmed_value=None,reference_value=None,sale_proceeds=0,ambiguous=False)
    if position['phase']=='unresolved':
        return result
    if position['phase']=='halted':
        result['reference_value']=position['shares']*position['last_close']
        return result
    problem=price_problem(None,quote)
    if problem:
        return dict(result,status='unresolved',reason=problem)
    shares,invested=position['shares'],position['invested']
    if type(shares) is not int or shares<=0 or not math.isfinite(invested) or invested<=0:
        raise ValueError('Invalid position cost')
    basis=invested/shares
    upper,lower=basis*(1+take/100),basis*(1-stop/100)
    price,status,reason=quote['close'],'open','최신 종가 평가'
    if quote['open']<=lower:
        price,status,reason=quote['open'],'stop','손절선 아래 갭 시가 청산'
    elif quote['open']>=upper:
        price,status,reason=quote['open'],'take','익절선 위 갭 시가 청산'
    elif quote['high']>=upper and quote['low']<=lower:
        result['ambiguous']=True
        price,status,reason=lower,'stop','같은 날 양쪽 도달 · 손절 우선'
    elif quote['low']<=lower:
        price,status,reason=lower,'stop','장중 손절선 도달'
    elif quote['high']>=upper:
        price,status,reason=upper,'take','장중 익절선 도달'
    value=shares*price
    result.update(status=status,reason=reason,pnl=round(value-invested,4),return_pct=(value/invested-1)*100,
                  exit_price=price if status!='open' else None,confirmed_value=value,
                  sale_proceeds=value if status!='open' else 0)
    return result
