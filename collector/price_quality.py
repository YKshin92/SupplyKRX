"""Keep inconsistent provider prices out of calculations without discarding flows."""
import math

PRICE_FIELDS=('open','high','low','close','change_pct','volume','turnover')

def price_issue(quote):
    for field in PRICE_FIELDS:
        value=quote.get(field)
        if value is None:
            continue
        if not isinstance(value,(int,float)) or not math.isfinite(value) or abs(value)>2**53-1:
            return 'invalid_number'
        if field!='change_pct' and (value<0 or not float(value).is_integer()):
            return 'invalid_price_or_volume'
    # A suspended stock can have no trades and a carried closing reference.
    if quote.get('volume')==0 and all(quote.get(k)==0 for k in ('open','high','low')):
        return None
    if all(quote.get(k) is not None for k in ('open','high','low','close')):
        if quote['low']>min(quote['open'],quote['close']) or quote['high']<max(quote['open'],quote['close']) or quote['high']<quote['low']:
            return 'ohlc_bounds'
    return None

def reconcile_price_issues(rows,existing,issues):
    """Reuse only previously validated prices for the exact date/code/investor.

    New sessions retain null prices; no previous-day price or invented zero is used.
    """
    prior={(r['date'],r['code'],r['investor'],r['scope']):r for r in existing}
    flagged={(i['date'],i['code']) for i in issues if i['status']=='unresolved'}
    restored={}
    for row in rows:
        if (row['date'],row['code']) not in flagged:
            continue
        old=prior.get((row['date'],row['code'],row['investor'],row['scope']))
        if old and not price_issue(old) and any(old.get(k) is not None for k in PRICE_FIELDS):
            row.update({k:old.get(k) for k in PRICE_FIELDS})
            restored.setdefault((row['date'],row['code']),set()).add(row['investor'])
    for issue in issues:
        if (issue['date'],issue['code']) in restored:
            issue['status']='prior_same_session_preserved'
            issue['preserved_investors']=sorted(restored[(issue['date'],issue['code'])])
    return rows
