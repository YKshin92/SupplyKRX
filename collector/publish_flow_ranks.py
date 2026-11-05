"""Bounded, immutable private rank projections. Missing history stays unknown.

2026-11-06 (user request): windows latest/5d/20d/1m/2m/3m; each stock also carries the previous session's
rank of the same window (`rank_change`, `new_entry`), the 연기금 markers used by the 매매법 (3개월 무매수 → 첫 매수 →
신호 조건), and `pension_score` (연기금 두 항목만, 0~100). The 8-item `score` and the manifest version stay as they
were so the forward score observation keeps recording the same number.
"""
import calendar,hashlib,json
from datetime import date
from statistics import mean
from .core import load_rows,save_json
from .flow_ranks import rank_flows
from .metadata_snapshots import validate_snapshots,validate_universes

VIEWS=('latest','5d','20d','1m','2m','3m')
PENSION='연기금 등';SIGNAL_NET=3e8;QUIET_SELL=1e8;VOLUME_RATIO=3.0


def month_start(day,months):
    d=date.fromisoformat(day);year,month=divmod(d.year*12+d.month-1-months,12);month+=1
    return date(year,month,min(d.day,calendar.monthrange(year,month)[1])).isoformat()


def window_days(available,view,as_of):
    """Sessions of one window ending at as_of. 5d/20d count sessions; 1m/2m/3m are calendar months."""
    upto=[d for d in available if d<=as_of]
    if view=='latest':return upto[-1:]
    if view.endswith('d'):return upto[-int(view[:-1]):]
    start=month_start(as_of,int(view[0]))
    return [d for d in upto if d>=start]


def pension_markers(rows,available,as_of):
    """Per code: quiet_3m (no 연기금 buy and sells under 1억 over the 3 calendar months before as_of), first_buy
    (quiet_3m and a 연기금 buy on as_of), signal (quiet_3m, net >= 3억, volume <= 3x the 20-session mean).
    None when the live history does not cover the whole window; nothing is filled with zeros."""
    start=month_start(as_of,3);prior=[d for d in available if start<=d<as_of]
    first_live=min(r['date'] for r in rows)
    covered=bool(prior) and first_live<=prior[0]
    pension={};volume={}
    for r in rows:
        if r['investor']==PENSION:
            pension[(r['code'],r['date'])]=r
            if r.get('volume') is not None:volume[(r['code'],r['date'])]=r['volume']
    vol_days=[d for d in available if d<as_of][-20:]
    out={}
    for (code,day),r in pension.items():
        if day!=as_of:continue
        if not covered:
            out[code]=dict(quiet_3m=None,first_buy=None,signal=None,net=r['net']);continue
        hist=[pension.get((code,d)) for d in prior]
        if any(h is None or h['buy'] is None or h['sell'] is None for h in hist):
            out[code]=dict(quiet_3m=None,first_buy=None,signal=None,net=r['net']);continue
        quiet=sum(h['buy'] for h in hist)==0 and sum(h['sell'] for h in hist)<QUIET_SELL
        first=quiet and (r['buy'] or 0)>0
        vols=[volume.get((code,d)) for d in vol_days]
        ratio=None
        if len(vols)==20 and all(v is not None for v in vols) and mean(vols)>0 and volume.get((code,as_of)) is not None:
            ratio=volume[(code,as_of)]/mean(vols)
        signal=None if ratio is None else bool(quiet and (r['net'] or 0)>=SIGNAL_NET and ratio<=VOLUME_RATIO)
        out[code]=dict(quiet_3m=quiet,first_buy=first,signal=signal,net=r['net'],volume_ratio_20=None if ratio is None else round(ratio,3))
    return out


def score_ranks(stocks):
    """1-based rank by the 8-item score (ties share the mean rank); None when the score is missing."""
    scored=sorted([s for s in stocks if s['score'] is not None],key=lambda s:-s['score'])
    ranks={};position=1
    groups={}
    for s in scored:groups.setdefault(s['score'],[]).append(s['code'])
    for value in sorted(groups,reverse=True):
        codes=groups[value];rank=position+(len(codes)-1)/2
        for code in codes:ranks[code]=rank
        position+=len(codes)
    return ranks


def publish_ranks(root,target,limit=1_200_000):
    rows=load_rows(root/'data/live')
    if not rows:raise ValueError('No flow rows')
    as_of=max(r['date'] for r in rows)
    def unavailable(reason):
        state=dict(state='unavailable',reason=reason,as_of=as_of)
        for view in VIEWS:save_json(target/'flow-ranks'/f'{view}.json',state)
        return state
    source=root/'data/live/metadata/daily'/f'{as_of}.json'
    if not source.exists():return unavailable('기준일 시총 자료 미수집')
    snapshot=json.loads(source.read_text(encoding='utf-8'));universe=snapshot.get('universe')
    if not universe:return unavailable('수집 당시 보통주 모집단 미확인')
    if snapshot['as_of']!=as_of:raise ValueError('Snapshot date mismatch')
    validate_snapshots({as_of:snapshot['instruments']});validate_universes({as_of:snapshot['instruments']},{as_of:universe})
    calendar_data=json.loads((root/'data/live/calendar.json').read_text(encoding='utf-8'))
    available=sorted(set(calendar_data['sessions']))
    manifests={}
    markers=pension_markers(rows,available,as_of)
    previous_day=next((d for d in reversed(available) if d<as_of),None)
    previous_source=root/'data/live/metadata/daily'/f'{previous_day}.json' if previous_day else None
    previous=None
    if previous_source and previous_source.exists():
        prev_snapshot=json.loads(previous_source.read_text(encoding='utf-8'))
        if prev_snapshot.get('universe') and prev_snapshot['as_of']==previous_day:previous=prev_snapshot
    for view in VIEWS:
        days=window_days(available,view,as_of)
        start=days[0] if view in ('latest','5d','20d') else month_start(as_of,int(view[0]))
        result=rank_flows(rows,days,as_of,universe['stocks'],snapshot['instruments'])
        names={item['code']:item.get('name') for item in universe['stocks']}
        for stock in result['stocks']:
            stock.update(name=names[stock['code']],market_cap=snapshot['instruments'].get(stock['code'],{}).get('market_cap'))
        result['universe']=dict(classification_status=universe['classification_status'],classification_observed_date=universe['classification_observed_date'],source=universe['source'])
        result['requested_start']=start
        complete_window=view=='latest' or (view.endswith('d') and len(days)==int(view[:-1])) or (not view.endswith('d') and available[0]<=start)
        result['warmup_coverage']='complete' if complete_window else 'partial_calendar'
        # A short calendar must not certify a full requested window.
        if result['warmup_coverage']!='complete':
            for stock in result['stocks']:stock['score']=None
        # Previous session, same window, for 전일 대비 순위 변동 / 신규 진입. Needs that day's own snapshot.
        prev_ranks=None;result['previous_as_of']=None
        if previous and complete_window:
            prev_days=window_days(available,view,previous_day)
            prev_complete=view=='latest' or (view.endswith('d') and len(prev_days)==int(view[:-1])) or (not view.endswith('d') and available[0]<=month_start(previous_day,int(view[0])))
            if prev_complete:
                prev=rank_flows(rows,prev_days,previous_day,previous['universe']['stocks'],previous['instruments'])
                prev_ranks=score_ranks(prev['stocks']);result['previous_as_of']=previous_day
        today_ranks=score_ranks(result['stocks'])
        for stock in result['stocks']:
            rank=today_ranks.get(stock['code']);stock['score_rank']=rank
            prev_rank=prev_ranks.get(stock['code']) if prev_ranks is not None else None
            stock['previous_score_rank']=prev_rank
            stock['rank_change']=None if rank is None or prev_ranks is None else (None if prev_rank is None else prev_rank-rank)
            stock['new_entry']=bool(prev_ranks is not None and rank is not None and prev_rank is None) if prev_ranks is not None else None
            parts=stock['components'];pts=[parts[PENSION+':absolute']['points'],parts[PENSION+':relative']['points']]
            stock['pension_score']=None if stock['score'] is None or any(p is None for p in pts) else sum(pts)*4
            # 되돌림 주의: 외국인·기관합계·사모 시총 대비 상위 5% (research 2026-11-05: those reverted on average).
            caution=[]
            for investor in ('외국인','기관합계','사모'):
                part=parts[investor+':relative']
                if part['rank'] is not None and part['population']>=20 and part['value'] is not None and part['value']>0 and part['rank']<=part['population']*0.05:caution.append(investor)
            stock['caution']=caution
            stock['pension']=markers.get(stock['code'],dict(quiet_3m=None,first_buy=None,signal=None,net=None))
        result['pension_coverage']='complete' if any(v['quiet_3m'] is not None for v in markers.values()) else 'insufficient_history'
        encoded=json.dumps(result,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False)
        generation=hashlib.sha256(encoded.encode()).hexdigest()[:20]
        folder=target/'flow-ranks/generations'/generation
        parts=[];batch=[];size=2
        def flush():
            filename=f'ranks-{len(parts):03}.json';save_json(folder/filename,batch);parts.append(filename)
        for stock in result.pop('stocks'):
            amount=len(json.dumps(stock,ensure_ascii=False,separators=(',',':')).encode())
            if amount+2>limit:raise ValueError('Rank row exceeds shard limit')
            if batch and size+amount+1>limit:flush();batch=[];size=2
            batch.append(stock);size+=amount+(1 if len(batch)>1 else 0)
        if batch:flush()
        result.update(state='ready',generation=f'generations/{generation}',files=parts)
        save_json(target/'flow-ranks'/f'{view}.json',result);manifests[view]=result
    return dict(state='ready',as_of=as_of,views=manifests)
