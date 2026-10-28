"""Immutable, private score observations for prospective research, not trade signals."""
from datetime import date,datetime,timezone,timedelta
from pathlib import Path
import gzip,hashlib,json,math,re
from .core import save_json

VERSION='flow-rank-equal8-v1'
KST=timezone(timedelta(hours=9))

def digest(data):return hashlib.sha256(data).hexdigest()

def read_snapshot(path,verify_parts=True):
    header=json.loads(path.read_text(encoding='utf-8'))
    if header.get('schema_version')!=1 or header.get('rule_version')!=VERSION:raise ValueError('Unknown score observation version')
    day=header['as_of'];stamp=datetime.fromisoformat(header['captured_at'])
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',day) or stamp.tzinfo is None or day>stamp.astimezone(KST).date().isoformat():raise ValueError('Invalid score observation date')
    date.fromisoformat(day)
    if path.parent.parent.name!=day or header.get('window')!='3m':raise ValueError('Score observation scope mismatch')
    if header['capture_kind'] not in ('same_day_after_close','late_or_unverified_capture'):raise ValueError('Invalid capture classification')
    if header['capture_kind']=='same_day_after_close' and (stamp.astimezone(KST).date().isoformat()!=day or stamp.astimezone(KST).hour<16 or header['universe']['classification_status']!='asof_observed' or header['universe']['classification_observed_date']!=day):raise ValueError('Historical capture cannot be prospective')
    if not 0<=header['complete_scores']<=header['population']:raise ValueError('Invalid observation coverage')
    if header['generation']!=path.parent.name or not re.fullmatch('[a-f0-9]{20}',header['generation']):raise ValueError('Invalid score observation generation')
    parts=header['parts']
    if not parts or len(parts)>100 or len({p['file'] for p in parts})!=len(parts):raise ValueError('Invalid score observation parts')
    count=0;complete=0;codes=set()
    for part in parts:
        if not re.fullmatch(r'ranks-\d{3}\.json\.gz',part['file']):raise ValueError('Unsafe score observation path')
        if not all(re.fullmatch('[a-f0-9]{64}',part[k]) for k in ('sha256','raw_sha256')):raise ValueError('Invalid observation checksum')
        if verify_parts:
            packed=(path.parent/part['file']).read_bytes()
            if digest(packed)!=part['sha256']:raise ValueError('Changed immutable score observation')
            data=gzip.decompress(packed)
            if digest(data)!=part['raw_sha256']:raise ValueError('Invalid score observation contents')
            stocks=json.loads(data)
            for s in stocks:
                if set(s)-{'code','market','name','market_cap','components','score','known_points'}:raise ValueError('Outcomes cannot enter score observations')
                if s['code'] in codes or not re.fullmatch('[0-9A-Z]{6}',s['code']):raise ValueError('Duplicate/invalid score stock')
                codes.add(s['code']);count+=1;complete+=s['score'] is not None
            if len(stocks)!=part['stocks']:raise ValueError('Score observation part count mismatch')
    if verify_parts and count!=header['population']:raise ValueError('Score observation population mismatch')
    if verify_parts and complete!=header['complete_scores']:raise ValueError('Score observation coverage mismatch')
    return header

def freeze_scores(root,projection,now=None):
    now=now or datetime.now(timezone.utc)
    if now.tzinfo is None:raise ValueError('Observation timestamp needs a timezone')
    m=json.loads((projection/'flow-ranks/3m.json').read_text(encoding='utf-8'))
    if m.get('state')!='ready' or m.get('warmup_coverage')!='complete':return dict(state='unavailable',reason='3개월 수급 준비 미완료')
    generation=m['generation']
    if m.get('version')!=VERSION or not re.fullmatch('generations/[a-f0-9]{20}',generation):raise ValueError('Invalid score projection')
    files=m['files']
    if not files or len(files)>100 or len(set(files))!=len(files) or any(not re.fullmatch(r'ranks-\d{3}\.json',f) for f in files):raise ValueError('Invalid score projection parts')
    day=m['as_of'];local=now.astimezone(KST)
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',day) or date.fromisoformat(day).isoformat()!=day:raise ValueError('Invalid projection date')
    if day>local.date().isoformat():raise ValueError('Cannot observe future scores')
    if day==local.date().isoformat() and local.hour<16:return dict(state='unavailable',reason='당일 장 마감 전 기록 보류')
    target=root/'data/live/score-snapshots'/day/generation.split('/')[1];header_path=target/'snapshot.json'
    if header_path.exists():return dict(state='ready',created=False,**read_snapshot(header_path))
    parts=[];all_stocks=[]
    for f in files:
        data=(projection/'flow-ranks'/generation/f).read_bytes();stocks=json.loads(data);all_stocks.extend(stocks)
        parts.append((f+'.gz',data,gzip.compress(data,mtime=0),len(stocks)))
    if len(all_stocks)!=m['population'] or len({s['code'] for s in all_stocks})!=len(all_stocks):raise ValueError('Score population mismatch')
    complete=sum(s['score'] is not None for s in all_stocks)
    if not complete:return dict(state='unavailable',reason='8항목 총점 미확보')
    for s in all_stocks:
        if set(s)-{'code','market','name','market_cap','components','score','known_points'}:raise ValueError('Outcomes cannot enter score observations')
        if s['score'] is not None and (not math.isfinite(s['score']) or not 0<=s['score']<=100.000001):raise ValueError('Invalid observed score')
    calendar_path=root/'data/live/calendar.json';calendar=json.loads(calendar_path.read_text(encoding='utf-8'))
    days=[d for d in calendar['sessions'] if m['first_date']<=d<=day]
    if len(days)!=m['sessions']:raise ValueError('Observation calendar differs from projection')
    inputs=[]
    for d in days:
        p=root/'data/live/daily'/f'{d}.csv';inputs.append(dict(path=f'data/live/daily/{d}.csv',sha256=digest(p.read_bytes())))
    metadata_path=root/'data/live/metadata/daily'/f'{day}.json'
    observed=m['universe']['classification_status']=='asof_observed'
    kind='same_day_after_close' if day==local.date().isoformat() and local.hour>=16 and observed else 'late_or_unverified_capture'
    header=dict(schema_version=1,rule_version=VERSION,as_of=day,generation=generation.split('/')[1],captured_at=now.isoformat(),capture_kind=kind,
        population=m['population'],complete_scores=complete,window='3m',first_date=m['first_date'],sessions=m['sessions'],
        finality='unconfirmed',universe=m['universe'],input_files=inputs,calendar_sha256=digest(calendar_path.read_bytes()),metadata_sha256=digest(metadata_path.read_bytes()),parts=[])
    target.mkdir(parents=True,exist_ok=True)
    for filename,data,packed,count in parts:
        p=target/filename
        if p.exists() and p.read_bytes()!=packed:raise ValueError('Immutable score part collision')
        temp=p.with_suffix('.tmp');temp.write_bytes(packed);temp.replace(p)
        header['parts'].append(dict(file=filename,sha256=digest(packed),raw_sha256=digest(data),stocks=count))
    save_json(header_path,header);read_snapshot(header_path)
    return dict(state='ready',created=True,**header)

def research_report(root,projection):
    m=json.loads((projection/'flow-ranks/3m.json').read_text(encoding='utf-8'))
    calendar=json.loads((root/'data/live/calendar.json').read_text(encoding='utf-8'))
    headers=[read_snapshot(p,False) for p in sorted((root/'data/live/score-snapshots').glob('*/*/snapshot.json'))]
    if headers:read_snapshot(max((p for p in (root/'data/live/score-snapshots').glob('*/*/snapshot.json')),key=lambda p:read_snapshot(p,False)['captured_at']))
    first={}
    for h in sorted(headers,key=lambda h:h['captured_at']):first.setdefault(h['as_of'],h)
    forward={}
    for h in sorted(headers,key=lambda h:h['captured_at']):
        if h['capture_kind']=='same_day_after_close':forward.setdefault(h['as_of'],h)
    eligible=list(forward.values())
    as_of=m['as_of'];mature=sum(sum(h['as_of']<d<=as_of for d in calendar['sessions'])>=20 for h in eligible)
    latest=max(headers,key=lambda h:h['captured_at']) if headers else None
    return dict(schema_version=1,rule_version=VERSION,state='recording' if headers else 'not_started',as_of=as_of,period='3m',
        population=m.get('population',0),snapshot_days=len(first),snapshot_versions=len(headers),same_day_capture_days=len(eligible),
        first_capture_as_of=min(first) if first else None,latest_captured_at=latest['captured_at'] if latest else None,
        mature_20_session_days=mature,observation_horizon=20,performance_evaluated=False,strategy_applied=False,
        note='날짜별 점수 관측 기록이며 매매 성과가 아닙니다. 늦게 만든 과거 기록을 전진 표본으로 세지 않습니다. 기존 v2와 매매 규칙은 유지합니다.')
