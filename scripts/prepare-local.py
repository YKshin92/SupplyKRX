"""Generate ignored live JSON for local viewing only, not a publication grant."""
import json
import sys
import argparse
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root))
from collector.core import publish
parser=argparse.ArgumentParser(description='Generate local/private web data')
parser.add_argument('--root',type=Path,default=root)
parser.add_argument('--target',type=Path,default=root/'public/data/live')
args=parser.parse_args()
calendar=json.loads((args.root/'data/live/calendar.json').read_text(encoding='utf-8'))
manifests=publish(args.root/'data/live',args.target,'live',calendar)
for investor,manifest in manifests.items():
    print(f"{investor}: {manifest['stock_count']} stocks, {manifest['row_count']} rows. Local only.")
