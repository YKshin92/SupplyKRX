"""Overlay a complete current private projection; preserve normal live fallback."""
import argparse,json,re,shutil
from pathlib import Path
def overlay(history,live,target):
    p=history/'history-quality.json'
    if not p.exists():print('Historical projection not generated; keep live fallback.');return False
    q=json.loads(p.read_text(encoding='utf-8'));days=sorted(x.stem for x in (live/'daily').glob('*.csv'))
    if not days or q['as_of']!=days[-1]:print('Historical projection refresh pending; keep current live fallback.');return False
    if q.get('metadata_missing',1):raise ValueError('Historical metadata verification incomplete')
    for manifest,key in [('tracking-history.json','files'),('simulation-input.json','stock_files')]:
        d=json.loads((history/manifest).read_text(encoding='utf-8'))
        for file in d[key]:
            if '/' in file or '\\' in file or not (history/file).is_file():raise ValueError('Missing or invalid historical part')
    target.mkdir(parents=True,exist_ok=True)
    allowed=re.compile(r'^(history-quality|tracking-history(?:-[0-9]{3})?|simulation-input|simulation-stocks-[0-9]{3}|history-stock-[0-9A-Z]{6})\.json$')
    # Parts first, manifests last so readers never see references to absent parts.
    files=sorted(history.glob('*.json'),key=lambda p:p.name in ('tracking-history.json','simulation-input.json'))
    for p in files:
        if not allowed.fullmatch(p.name):continue
        if p.stat().st_size>2_000_000:raise ValueError('Historical part exceeds response budget: '+p.name)
        shutil.copy2(p,target/p.name)
    print('Historical projection overlaid:',q['first_date'],q['as_of'],q['sessions']);return True
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--history',type=Path,required=True);p.add_argument('--live',type=Path,required=True);p.add_argument('--target',type=Path,required=True);a=p.parse_args();overlay(a.history,a.live,a.target)

