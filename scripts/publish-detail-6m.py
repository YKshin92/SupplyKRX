"""Build-time 6-month stock detail files for stocks without a 3-year history file.

The detail panel's "최근 6개월" view reads /data/live/history-stock-<code>.json when the 3-year history built one (stocks
with a 연기금 new-buy signal). Every other stock gets /data/live/detail-6m/<code>.json here: 연기금 and 외국인 rows for the
last 6 calendar months from the live daily files, with the days before live collection began taken from the verified
archive copies in data/live/detail-backfill (same KRX rows). Live rows win when a date exists in both. No date is
filled in: a session missing from both sources stays missing.
"""
import argparse
import calendar as month_calendar
import csv
import gzip
import io
import json
import sys
from datetime import date
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from collector.core import validate, save_json

KEEP = ('date', 'code', 'investor', 'buy', 'sell', 'net', 'open', 'high', 'low', 'close', 'volume', 'change_pct', 'flow_status')
INVESTORS = ('연기금 등', '외국인')


def months_back(day, months):
    d = date.fromisoformat(day)
    y, m = divmod(d.year * 12 + d.month - 1 - months, 12)
    m += 1
    return date(y, m, min(d.day, month_calendar.monthrange(y, m)[1])).isoformat()


def rows_of(path):
    opener = gzip.open if path.suffix == '.gz' else open
    with opener(path, 'rt', encoding='utf-8-sig', newline='') as f:
        return [validate(r) for r in csv.DictReader(f)]


def build(root, target, months=6):
    live = sorted((root / 'data/live/daily').glob('????-??-??.csv'))
    if not live:
        raise SystemExit('no live daily files')
    as_of = live[-1].stem
    start = months_back(as_of, months)
    files = {p.name.removesuffix('.csv.gz'): p for p in sorted((root / 'data/live/detail-backfill').glob('????-??-??.csv.gz'))}
    files.update({p.stem: p for p in live})  # live wins on overlap
    sessions = json.loads((root / 'data/live/calendar.json').read_text(encoding='utf-8')).get('sessions', [])
    wanted = [d for d in sessions if start <= d <= as_of]
    missing = [d for d in wanted if d not in files]  # checked where the live calendar reaches; the archive index covers earlier days
    by_code = {}
    for day in sorted(d for d in files if start <= d <= as_of):
        for r in rows_of(files[day]):
            if r['investor'] in INVESTORS:
                by_code.setdefault(r['code'], {}).setdefault(r['investor'], []).append({k: r.get(k) for k in KEEP})
    current = {code for code, inv in by_code.items() if any(x['date'] == as_of for x in inv.get('연기금 등', []))}
    written = 0
    for code in sorted(current):
        if (target / f'history-stock-{code}.json').exists():
            continue
        inv = by_code[code]
        save_json(target / 'detail-6m' / f'{code}.json', dict(
            as_of=as_of, start=start, missing_sessions=missing,
            pension=sorted(inv.get('연기금 등', []), key=lambda r: r['date']),
            foreign=[dict(date=r['date'], code=code, investor='외국인', net=r['net']) for r in sorted(inv.get('외국인', []), key=lambda r: r['date'])]))
        written += 1
    used = [d for d in files if start <= d <= as_of]
    return dict(as_of=as_of, start=start, sessions=len(used), missing=missing, written=written)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', type=Path, required=True)
    ap.add_argument('--target', type=Path, required=True)
    ap.add_argument('--months', type=int, default=6)
    a = ap.parse_args()
    report = build(a.root, a.target, a.months)
    print(f"6-month detail: {report['written']} stocks, {report['start']} ~ {report['as_of']}, {report['sessions']} sessions, missing {len(report['missing'])}")
