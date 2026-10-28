"""Record private immutable scores, never rewrite earlier observations."""
import argparse,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from collector.score_snapshots import freeze_scores
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--projection',type=Path,required=True);p.add_argument('--require-ready',action='store_true');a=p.parse_args()
    r=freeze_scores(a.root,a.projection)
    print(json.dumps({k:r.get(k) for k in ('state','reason','created','as_of','captured_at','capture_kind','population','complete_scores')},ensure_ascii=False))
    if a.require_ready and r['state']!='ready':raise SystemExit('Score observation not ready; preserve existing private state')
