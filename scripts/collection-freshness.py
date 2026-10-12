"""Skip duplicate invocations only when today's data was collected recently."""
import argparse
import csv
import os
from pathlib import Path
from datetime import datetime, timezone
from zoneinfo import ZoneInfo


def fresh(rows, day, now, minutes=15):
    if not rows or any(r['date'] != day for r in rows):
        return False
    try:
        stamps = [datetime.fromisoformat(r['collected_at'].replace('Z', '+00:00')) for r in rows]
        if any(d.tzinfo is None for d in stamps):
            return False
        age = (now - min(stamps)).total_seconds()
        groups = {(r['market'], r['investor']) for r in rows}
        return 0 <= age < minutes * 60 and all((m, i) in groups for m in ('KOSPI', 'KOSDAQ') for i in ('연기금 등', '외국인'))
    except (ValueError, KeyError):
        return False


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--end', default='')
    parser.add_argument('--start', default='')
    parser.add_argument('--check-only', default='false')
    args = parser.parse_args()
    day = args.end or datetime.now(ZoneInfo('Asia/Seoul')).date().isoformat()
    path = args.root / 'data/live/daily' / (day + '.csv')
    rows = []
    if path.exists():
        with path.open(encoding='utf-8-sig', newline='') as handle:
            rows = list(csv.DictReader(handle))
    # The backup call arrives 20 minutes after its primary slot.
    minutes = 30 if args.check_only == 'true' else 15
    skip = not args.start and fresh(rows, day, datetime.now(timezone.utc), minutes)
    with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as handle:
        handle.write('skip=' + str(skip).lower() + '\n')
    print('Recent complete collection exists; skip duplicate collection.' if skip else 'Collection is due.')
