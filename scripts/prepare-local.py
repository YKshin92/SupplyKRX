"""Generate ignored live JSON for local viewing only, not a publication grant."""
import json
import sys
import argparse
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root))
from collector.core import publish, load_rows, publish_investor, save_json
from collector.investors import PUBLICATION_PATHS
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
for months in (1,2,3):
    month_index=end.year*12+end.month-1-months
    year,month=divmod(month_index,12)
    month+=1
    start=date(year,month,min(end.day,month_calendar.monthrange(year,month)[1])).isoformat()
    first=max(start,min(r['date'] for r in rows))
    sessions=[d for d in calendar['sessions'] if first<=d<=as_of]
    view_calendar={**calendar,'sessions':sessions}
    for investor,suffix in PUBLICATION_PATHS.items():
        selected=[r for r in rows if r['investor']==investor and first<=r['date']<=as_of]
        if selected:
            manifest=publish_investor(selected,args.target/'periods'/f'{months}m'/suffix,'live',view_calendar,investor,len(sessions))
            print(f"{months}m {investor}: {manifest['days']} sessions, {manifest['row_count']} rows.")

from collector.rsi import publish_rsi
index_path=args.root/'data/live/simulation-indices.json'
us_path=args.root/'data/live/us-market.json'
# Wilder RSI depends on where it starts: use the 3-year index history, overlaid by the live index file.
rsi_indices={'indices':{}}
for path in (args.root/'data/history-indices.json',index_path):
    if path.exists():
        for name,value in json.loads(path.read_text(encoding='utf-8')).get('indices',{}).items():
            rsi_indices['indices'].setdefault(name,{'prices':{}})['prices'].update(value.get('prices',{}))
rsi=publish_rsi(rows,calendar,rsi_indices,args.target,metadata_dir=args.root/'data/live/metadata/daily',us=json.loads(us_path.read_text(encoding='utf-8')) if us_path.exists() else None,warmup=args.root/'data/live/rsi-warmup.json.gz')
print(f"RSI: {rsi['computed']}/{rsi['population']} computed, {rsi['below30']} below 30, {rsi['entries_today']} entries. Private/local only.")
from collector.publish_flow_ranks import publish_ranks
rank_report=publish_ranks(args.root,args.target)
print(f"Flow ranks: {rank_report['state']}. Private/local only.")
from collector.score_snapshots import research_report
save_json(args.target/'flow-score-research.json',research_report(args.root,args.target))
