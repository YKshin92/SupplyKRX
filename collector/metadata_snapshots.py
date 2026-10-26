"""Point-in-time market-cap snapshots, stored separately from flow CSVs."""
from datetime import date
import math,re


def validate_snapshots(snapshots):
    for day,instruments in snapshots.items():
        if date.fromisoformat(day).isoformat()!=day or not instruments:raise ValueError('Invalid metadata snapshot date')
        for code,item in instruments.items():
            cap=item.get('market_cap')
            if not re.fullmatch(r'[0-9A-Z]{6}',code) or item.get('metadata_date')!=day:raise ValueError('Metadata code/date mismatch')
            if isinstance(cap,bool) or not isinstance(cap,(int,float)) or not math.isfinite(cap) or not 0<=cap<=2**53-1 or int(cap)!=cap:raise ValueError('Invalid snapshot market cap')
            if not item.get('metadata_source'):raise ValueError('Metadata source required')
    return snapshots


def validate_universes(snapshots,universes):
    if set(snapshots)!=set(universes):raise ValueError('Universe snapshot dates differ')
    for day,universe in universes.items():
        if universe.get('as_of')!=day or not universe.get('stocks') or not universe.get('source'):raise ValueError('Missing universe date/stocks/source')
        observed=universe.get('classification_observed_date','')
        if date.fromisoformat(observed).isoformat()!=observed or observed<day:raise ValueError('Invalid classification observation date')
        expected='asof_observed' if observed==day else 'historical_classification_unverified'
        if universe.get('classification_status')!=expected:raise ValueError('Invalid universe classification status')
        codes=set()
        for item in universe['stocks']:
            code=item.get('code','')
            if not re.fullmatch(r'[0-9A-Z]{6}',code) or code in codes or item.get('market') not in ('KOSPI','KOSDAQ'):raise ValueError('Invalid universe stock')
            codes.add(code)


def write_snapshots(root,snapshots,collected_at,universes=None):
    from .core import save_json
    import json
    validate_snapshots(snapshots)  # Validate the entire batch before any writes.
    if universes is not None:validate_universes(snapshots,universes)
    for day,instruments in snapshots.items():
        path=root/'metadata/daily'/f'{day}.json'
        payload=dict(schema_version=1,as_of=day,collected_at=collected_at,instruments=instruments)
        incoming=universes.get(day) if universes is not None else None
        existing=json.loads(path.read_text(encoding='utf-8')).get('universe') if path.exists() else None
        # A later surviving-stock master cannot replace an observed as-of cohort.
        if existing and (incoming is None or existing.get('classification_status')=='asof_observed' and incoming.get('classification_status')!='asof_observed'):
            payload['universe']=existing;payload['universe_preserved_from_snapshot']=True
        elif incoming is not None:payload['universe']=incoming
        save_json(path,payload)
