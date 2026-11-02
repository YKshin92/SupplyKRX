"""Publish 전략 개선 후보 for the authenticated site: <root>/data/strategy/*.json -> <target>/strategy-candidates.json.
usage: publish-strategy-candidates.py --root <private data repo> --target <public/data/live>"""
import argparse, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from collector.strategy_candidates import publish

if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('--root', type=Path, required=True); p.add_argument('--target', type=Path, required=True); a = p.parse_args()
    out = publish(a.root, a.target)
    print('Strategy candidates:', out['counts'], 'Private/local only.')
