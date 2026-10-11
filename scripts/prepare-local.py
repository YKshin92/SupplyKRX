"""Generate ignored live JSON for local viewing only, not a publication grant."""
import json
import sys
import argparse
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root))
from collector.core import publish, load_rows, publish_investor
from datetime import date
import calendar as month_calendar
parser=argparse.ArgumentParser(description='Generate local/private web data')
parser.add_argument('--root',type=Path,default=root)
parser.add_argument('--target',type=Path,default=root/'public/data/live')
args=parser.parse_args()
calendar=json.loads((args.root/'data/live/calendar.json').read_text(encoding='utf-8'))
manifests=publish(args.root/'data/live',args.target,'live',calendar)
for investor,manifest in manifests.items():
    print(f"{investor}: {manifest['stock_count']} stocks, {manifest['row_count']} rows. Local only.")

# Longer views are generated only into the explicitly selected private/local target.
rows=load_rows(args.root/'data/live')
from collector.tracking import publish_tracking
publish_tracking(rows,calendar,args.target)
from collector.entry_events import publish_entry_events
entry_events=publish_entry_events(rows,calendar,args.target)
print(f"Re-entry: {len(entry_events['events'])} events, through {entry_events['as_of']}. Private/local only.")
as_of=max(r['date'] for r in rows)
end=date.fromisoformat(as_of)
for months in (1,3):
    month_index=end.year*12+end.month-1-months
    year,month=divmod(month_index,12)
    month+=1
    start=date(year,month,min(end.day,month_calendar.monthrange(year,month)[1])).isoformat()
    first=max(start,min(r['date'] for r in rows))
    sessions=[d for d in calendar['sessions'] if first<=d<=as_of]
    view_calendar={**calendar,'sessions':sessions}
    for investor,suffix in [('연기금 등',''),('외국인','foreign')]:
        selected=[r for r in rows if r['investor']==investor and first<=r['date']<=as_of]
        if selected:
            manifest=publish_investor(selected,args.target/'periods'/f'{months}m'/suffix,'live',view_calendar,investor,len(sessions))
            print(f"{months}m {investor}: {manifest['days']} sessions, {manifest['row_count']} rows.")
