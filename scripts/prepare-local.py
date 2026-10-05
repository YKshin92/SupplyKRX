"""Generate ignored live JSON for local viewing only, not a publication grant."""
import json
import sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root))
from collector.core import publish
calendar=json.loads((root/'data/live/calendar.json').read_text(encoding='utf-8'))
manifest=publish(root/'data/live',root/'public/data/live','live',calendar)
print(f"Local preview: {manifest['stock_count']} stocks, {manifest['row_count']} rows. Do not deploy without data permission.")
