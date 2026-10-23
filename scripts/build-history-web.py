"""Read-only historical archive projection. Output must remain private/authenticated."""
import argparse,calendar,csv,gzip,hashlib,json,sys
from collections import defaultdict,deque
from datetime import date
from pathlib import Path
from statistics import mean
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from collector.tracking import build_tracking
from collector.simulation_portfolio import entry_score
NAMES=('buy','sell','net','open','high','low','close','volume','change_pct','turnover')
def dump(p,x):
    p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,ensure_ascii=False,allow_nan=False,separators=(',',':')),encoding='utf-8')
def cut(day):
    d=date.fromisoformat(day);y,m=divmod(d.year*12+d.month-1-3,12);m+=1
    return date(y,m,min(d.day,calendar.monthrange(y,m)[1])).isoformat()
def partition(target,prefix,records,limit=1_500_000):
    files=[];batch=[];size=2
    for record in records:
        n=len(json.dumps(record,ensure_ascii=False,separators=(',',':')).encode('utf-8'))+1
        if batch and size+n>limit:
            path=f'{prefix}-{len(files):03}.json';dump(target/path,batch);files.append(path);batch=[];size=2
        batch.append(record);size+=n
    if batch:
        path=f'{prefix}-{len(files):03}.json';dump(target/path,batch);files.append(path)
    return files
def build(archive,live,target,indices_path=None,metadata_root=None):
    idx=json.loads((archive/'data/history/index.json').read_text());req=json.loads((archive/'data/history/request.json').read_text())
    assert sorted(idx['days'])==req['expected_sessions'],'Incomplete archived dates'
    files={d:archive/e['csv_path'] for d,e in idx['days'].items()}
    for p in (live/'daily').glob('*.csv'):
        if p.stem>max(idx['days']):files[p.stem]=p
    days=sorted(files);daypos={d:i for i,d in enumerate(days)};metadata=json.loads((live/'calendar.json').read_text(encoding='utf-8')) if (live/'calendar.json').exists() else {}
    quality={'archived_sessions':len(idx['days']),'sessions':len(days),'first_date':days[0],'as_of':days[-1],'rows':0,'metadata_available':0,'metadata_missing':0,'price_quality_issues':sum(e.get('price_quality_issues',0) for e in idx['days'].values()),'instrument_type_status':'historical_classification_unverified','quiet_cap_max':1e8,'index_coverage':{}}
    def read(d):
        p=files[d];op=gzip.open if p.suffix=='.gz' else open
        with op(p,'rt',encoding='utf-8-sig',newline='') as f:
            for r in csv.DictReader(f):
                for k in NAMES:r[k]=float(r[k]) if r.get(k) not in ('',None) else None
                yield r
    recent=defaultdict(lambda:deque(maxlen=90));extras={};wanted=set()
    for i,d in enumerate(days):
        if d in idx['days']:
            assert hashlib.sha256(files[d].read_bytes()).hexdigest()==idx['days'][d]['csv_sha256'],d
            mp=(metadata_root or archive)/idx['days'][d]['metadata_path']
            if mp.exists():
                assert hashlib.sha256(mp.read_bytes()).hexdigest()==idx['days'][d]['metadata_sha256'];quality['metadata_available']+=1
            else:quality['metadata_missing']+=1
        count=0;seen=set()
        for r in read(d):
            count+=1;key=(r['code'],r['investor']);assert key not in seen,(d,key);seen.add(key)
            if r['investor']!='연기금 등':continue
            q=recent[r['code']];previous=list(q)
            if r['net'] is not None and r['net']>=1e8:
                eligible=False
                for n in (10,20):
                    prior=previous[-n:]
                    if len(prior)==n and [x[0] for x in prior]==list(range(i-n,i)) and all(x[1] is not None and x[2] is not None and 0<=x[1]<1e8 and 0<=x[2]<1e8 for x in prior):eligible=True
                if eligible:
                    boundary=cut(d);pd=[j for j,s in enumerate(days[:i]) if s>=boundary];pr=[x for x in previous if days[x[0]]>=boundary]
                    complete=boundary>=days[0] and [x[0] for x in pr]==pd and all(x[1] is not None for x in pr)
                    volumes=[x[3] for x in previous[-20:]]
                    vr=r['volume']/mean(volumes) if len(volumes)==20 and all(v is not None for v in volumes) and mean(volumes)>0 and r['volume'] is not None else None
                    extras[r['code']+':'+d]=dict(quiet_3m=all(x[1]==0 for x in pr) if complete else None,volume_ratio_20=vr)
                    wanted.add(r['code'])
            q.append((i,r['buy'],r['sell'],r['volume']))
        if d in idx['days']:assert count==idx['days'][d]['rows'],d
        quality['rows']+=count
        if i%100==0:print('Scan',i,flush=True)
    h=defaultdict(dict);foreign=defaultdict(dict);collected=''
    for i,d in enumerate(days):
        for r in read(d):
            if r['code'] not in wanted:continue
            collected=max(collected,r.get('collected_at',''))
            if r['investor']=='연기금 등':h[r['code']][d]={k:r[k] for k in ('code','date','name','market','investor','flow_status',*NAMES)}
            else:foreign[r['code']][d]={k:r[k] for k in ('code','date','investor','buy','net')}
        if i%100==0:print('Load',i,flush=True)
    event_ids=set(extras)
    allrows=(r for group in (h,foreign) for history in group.values() for r in history.values())
    latest_meta=(metadata_root or archive)/idx['days'][max(idx['days'])]['metadata_path']
    if latest_meta.exists():
        archived_meta=json.loads(gzip.decompress(latest_meta.read_bytes()))
        live_meta_date=max((v.get('metadata_date') or '' for v in metadata.get('instruments',{}).values()),default='')
        if live_meta_date<=archived_meta['date']:
            metadata={**archived_meta,'instruments':{v['code']:v for v in archived_meta['instruments'].values()}}
    tracking=build_tracking(allrows,{'sessions':days,'instruments':metadata.get('instruments',{})},event_ids)
    event_dates=defaultdict(list)
    for e in tracking['events']:event_dates[e['signal_date']].append(e)
    for d,events in event_dates.items():
        if d not in idx['days']:continue
        mp=(metadata_root or archive)/idx['days'][d]['metadata_path']
        if not mp.exists():continue
        md=json.loads(gzip.decompress(mp.read_bytes()))
        for e in events:
            v=md['instruments'].get(e['market']+':'+e['code'],md['instruments'].get(e['code'],{}))
            e.update(signal_market_cap=v.get('market_cap'),signal_sector=v.get('sector'),signal_metadata_date=v.get('metadata_date'))
    first={}
    for e in sorted(tracking['events'],key=lambda x:x['signal_date']):
        e.update(extras[e['id']]);first.setdefault(e['code'],e['signal_date']);e['first_registration_date']=first[e['code']]
    target.mkdir(parents=True,exist_ok=True)
    parts=partition(target,'tracking-history',tracking.pop('events'));dump(target/'tracking-history.json',{**tracking,'files':parts,'quiet_cap_max':1e8})
    stocks=[]
    for code,hist in sorted(h.items()):
        dump(target/f'history-stock-{code}.json',dict(as_of=days[-1],pension=list(hist.values()),foreign=list(foreign.get(code,{}).values())))
        signals=[]
        for i,d in enumerate(days):
            info=extras.get(code+':'+d);r=hist.get(d)
            if not info or r['net']<3e8:continue
            prior=[hist.get(x) for x in days[i-10:i]]
            if len(prior)!=10 or any(not p or any(p[k] is None or not 0<=p[k]<1e8 for k in ('buy','sell')) for p in prior):continue
            signals.append(dict(index=i,net=r['net'],score=entry_score(r,foreign.get(code,{}).get(d,{}))['total'],absent=sum(p['flow_status']=='absent_zero' for p in prior),**info))
        if signals:
            r=hist[days[signals[0]['index']]];stocks.append(dict(code=code,name=r['name'],market=r['market'],signals=signals,prices=[{k:hist.get(d,{}).get(k) for k in ('open','high','low','close','volume','change_pct')} for d in days]))
    indices={};ip=indices_path or live/'simulation-indices.json'
    if ip.exists():
        raw=json.loads(ip.read_text(encoding='utf-8'))
        for key,value in raw.get('indices',{}).items():indices[key]=[value['prices'].get(d) for d in days];quality['index_coverage'][key]=sum(x is not None for x in indices[key])
    stockparts=partition(target,'simulation-stocks',stocks)
    dump(target/'simulation-input.json',dict(version=1,sessions=days,stocks=[],stock_files=stockparts,indices=indices,source=dict(stocks=len(wanted),rows=quality['rows'],collected_at=collected,repaired_rows=0,index_as_of=max([d for j,d in enumerate(days) if indices.get('KOSPI',[None]*len(days))[j] is not None],default=None),price_source='KRX historical archive; raw prices; instrument types unverified')))
    quality.update(tracking_events=sum(len(json.loads((target/p).read_text(encoding='utf-8'))) for p in parts),simulation_stocks=len(stocks),simulation_signals=sum(len(x['signals']) for x in stocks),tracking_parts=len(parts),simulation_parts=len(stockparts))
    dump(target/'history-quality.json',quality);print(json.dumps(quality,ensure_ascii=True,indent=2))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--archive',type=Path,required=True);p.add_argument('--live',type=Path,required=True);p.add_argument('--target',type=Path,required=True);p.add_argument('--indices',type=Path);p.add_argument('--metadata-root',type=Path);a=p.parse_args();build(a.archive,a.live,a.target,a.indices,a.metadata_root)

