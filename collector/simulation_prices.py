"""Verified supplemental quotes for missing local simulation prices only."""
import math

REPAIR_FIELDS=('open','high','low','close','volume','change_pct')


def verify_anchors(history,bars,day,identity):
    anchors=sorted(d for d in history if d<day and d in bars and all(history[d].get(k) and bars[d].get(k) for k in ('open','high','low','close')))[-2:]
    if not anchors or any(history[d].get(k)!=bars[d].get(k) for d in anchors for k in ('open','volume')):
        return anchors,None
    if len(anchors)==2:return anchors,'prior_2_sessions_open_and_volume'
    row=history[day]
    earlier=sorted(d for d in history if d<day)
    newly_listed=len(earlier)==1 and identity.get('symbol')==row['code'] and identity.get('name')==row['name'] and identity.get('origintime')==earlier[0].replace('-','')
    return anchors,'new_listing_one_anchor_and_listing_metadata' if newly_listed else None


def needs_quote(row):
    return row.get('volume')!=0 and any(row.get(k) is None for k in ('open','high','low','close','volume'))


def supplement(row, record):
    if not record or not needs_quote(row): return row
    quote=record.get('quote',{})
    base=record.get('base',{})
    if record.get('status')!='verified' or not record.get('url'):
        return row
    if any(row.get(k)!=base.get(k) for k in REPAIR_FIELDS):
        return row  # Source has changed; do not apply a stale supplement.
    values=[quote.get(k) for k in ('open','high','low','close','volume')]
    if any(not isinstance(v,(int,float)) or not math.isfinite(v) or v<=0 or v>2**53-1 or not float(v).is_integer() for v in values): return row
    o,h,l,c,v=values
    if not l<=min(o,c)<=max(o,c)<=h:return row
    if any(row.get(k) is not None and row[k]!=quote.get(k) for k in ('open','high','low','close','volume')):return row
    patched={**row,**{k:quote[k] for k in REPAIR_FIELDS if row.get(k) is None and quote.get(k) is not None}}
    if not patched['low']<=min(patched['open'],patched['close'])<=max(patched['open'],patched['close'])<=patched['high']:return row
    patched['_price_supplement']=record.get('source','NAVER Finance supplemental OHLCV')
    return patched
