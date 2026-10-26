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


def write_snapshots(root,snapshots,collected_at):
    from .core import save_json
    validate_snapshots(snapshots)  # Validate the entire batch before any writes.
    for day,instruments in snapshots.items():
        save_json(root/'metadata/daily'/f'{day}.json',dict(schema_version=1,as_of=day,collected_at=collected_at,instruments=instruments))
