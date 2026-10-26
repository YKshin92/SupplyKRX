"""Bounded, immutable private rank projections. Missing history stays unknown."""
import calendar,hashlib,json
from datetime import date
from .core import load_rows,save_json
from .flow_ranks import rank_flows
from .metadata_snapshots import validate_snapshots,validate_universes


def month_start(day,months):
    d=date.fromisoformat(day);year,month=divmod(d.year*12+d.month-1-months,12);month+=1
    return date(year,month,min(d.day,calendar.monthrange(year,month)[1])).isoformat()


def publish_ranks(root,target,limit=1_200_000):
    rows=load_rows(root/'data/live')
    if not rows:raise ValueError('No flow rows')
    as_of=max(r['date'] for r in rows)
    def unavailable(reason):
        state=dict(state='unavailable',reason=reason,as_of=as_of)
        for view in ('latest','1m','2m','3m'):save_json(target/'flow-ranks'/f'{view}.json',state)
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
    for view in ('latest','1m','2m','3m'):
        start=as_of if view=='latest' else month_start(as_of,int(view[0]))
        days=[d for d in available if start<=d<=as_of]
        result=rank_flows(rows,days,as_of,universe['stocks'],snapshot['instruments'])
        names={item['code']:item.get('name') for item in universe['stocks']}
        for stock in result['stocks']:
            stock.update(name=names[stock['code']],market_cap=snapshot['instruments'].get(stock['code'],{}).get('market_cap'))
        result['universe']=dict(classification_status=universe['classification_status'],classification_observed_date=universe['classification_observed_date'],source=universe['source'])
        result['requested_start']=start
        result['warmup_coverage']='complete' if view=='latest' or available[0]<=start else 'partial_calendar'
        # A short calendar must not certify a full requested month.
        if result['warmup_coverage']!='complete':
            for stock in result['stocks']:stock['score']=None
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
