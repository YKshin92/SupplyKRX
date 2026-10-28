"""Extend only institution/private-fund rows; preserve existing pension/prices/calendar.

Run in an isolated private checkout. The caller commits only after the final audit.
Historical security classification is explicitly observed later, never asserted as PIT.
"""
from collections import defaultdict
from datetime import date,timedelta
import hashlib,json
from pathlib import Path
from .core import read_csv,upsert,validate,save_json
from .metadata_snapshots import write_snapshots,validate_snapshots,validate_universes

TARGETS=('기관합계','사모')


def windows(days,max_calendar_days=21):
    """A <=21-calendar-day batch cannot exceed the provider's 20-session limit."""
    days=sorted(set(days))
    while days:
        start=days[0];end=(date.fromisoformat(start)+timedelta(days=max_calendar_days-1)).isoformat()
        batch=[d for d in days if d<=end]
        yield batch
        days=days[len(batch):]


def audit_day(rows,snapshot,day):
    if snapshot.get('as_of')!=day:raise ValueError('Backfill snapshot date mismatch')
    metadata=snapshot.get('instruments',{});validate_snapshots({day:metadata})
    universe=snapshot.get('universe',{})
    if universe.get('as_of')!=day or not universe.get('stocks'):raise ValueError('Backfill universe missing')
    validate_universes({day:metadata},{day:universe})
    expected=defaultdict(set)
    for stock in universe['stocks']:expected[stock['market']].add(stock['code'])
    groups=defaultdict(list)
    for r in rows:
        if r['investor'] not in TARGETS:continue
        if r['date']!=day:raise ValueError('Backfill row date mismatch')
        r=validate(r);groups[r['market'],r['investor']].append(r)
    report=[]
    for market in ('KOSPI','KOSDAQ'):
        for investor in TARGETS:
            batch=groups[market,investor];codes={r['code'] for r in batch}
            if not expected[market] or codes!=expected[market] or len(batch)!=len(codes):raise ValueError('Missing/duplicate backfill market universe')
            if any(r['buy'] is None or r['sell'] is None or r['net'] is None for r in batch):raise ValueError('Unconfirmed backfill flow')
            if sum(r['buy']+r['sell'] for r in batch)<=0:raise ValueError('Empty whole-market backfill response')
            report.append(dict(date=day,market=market,investor=investor,rows=len(batch),missing_caps=sum(not metadata.get(c,{}).get('market_cap') for c in codes)))
    return report


def preserved_digest(rows):
    original=sorted((r for r in rows if r['investor'] not in TARGETS),key=lambda r:(r['date'],r['code'],r['investor'],r['scope']))
    return hashlib.sha256(json.dumps(original,sort_keys=True,ensure_ascii=False).encode()).hexdigest()


def backfill(root:Path,start:str,end:str,collect=None):
    first,last=date.fromisoformat(start),date.fromisoformat(end)
    if first>last or (last-first).days>100:raise ValueError('Backfill must be an ordered range within 100 calendar days')
    raw=root/'data/live';calendar_path=raw/'calendar.json';calendar_bytes=calendar_path.read_bytes();calendar=json.loads(calendar_bytes)
    if min(calendar['sessions'])>start or calendar['checked_through']<end:raise ValueError('Trusted calendar does not cover requested range')
    days=[d for d in sorted(set(calendar['sessions'])) if start<=d<=end]
    if not days:raise ValueError('No trusted sessions to backfill')
    missing=[];original={}
    for day in days:
        path=raw/'daily'/f'{day}.csv';rows=read_csv(path) if path.exists() else []
        original[day]=preserved_digest(rows)
        try:audit_day(rows,json.loads((raw/'metadata/daily'/f'{day}.json').read_text(encoding='utf-8')),day)
        except (ValueError,FileNotFoundError,KeyError):missing.append(day)
    if collect is None:
        from .pykrx_provider import collect
    fetched=0
    for batch in windows(missing):
        print(f'Backfill {batch[0]}..{batch[-1]}: {len(batch)} missing sessions',flush=True)
        incoming,context=collect(batch[-1],days=20,start=batch[0],investors=TARGETS)
        wanted=set(batch);incoming=[r for r in incoming if r['date'] in wanted]
        if any(r['investor'] not in TARGETS for r in incoming):raise ValueError('Backfill attempted to replace another investor')
        snapshots={d:context['metadata_snapshots'][d] for d in batch}
        universes={d:context['universe_snapshots'][d] for d in batch}
        grouped=defaultdict(list)
        for r in incoming:grouped[r['date']].append(r)
        for day in batch:audit_day(grouped[day],dict(as_of=day,instruments=snapshots[day],universe=universes[day]),day)
        # Do not overwrite complete dates encountered between missing sessions.
        write_snapshots(raw,snapshots,max(r['collected_at'] for r in incoming),universes)
        upsert(raw,incoming);fetched+=len(batch)
        issues=[i for i in context.get('price_quality_issues',[]) if i['date'] in wanted]
        if issues:save_json(raw/'quality/investor-backfill'/f'{batch[0]}_{batch[-1]}.json',dict(issues=issues))
    coverage=[]
    for day in days:
        rows=read_csv(raw/'daily'/f'{day}.csv')
        if preserved_digest(rows)!=original[day]:raise ValueError('Existing pension/foreign rows changed')
        coverage.extend(audit_day(rows,json.loads((raw/'metadata/daily'/f'{day}.json').read_text(encoding='utf-8')),day))
    if calendar_path.read_bytes()!=calendar_bytes:raise ValueError('Backfill changed current calendar/metadata')
    return dict(start=days[0],end=days[-1],sessions=len(days),collected_sessions=fetched,reused_sessions=len(days)-fetched,rows=sum(c['rows'] for c in coverage),investors=list(TARGETS),preserved_other_investors=True,calendar_unchanged=True,coverage=coverage)
