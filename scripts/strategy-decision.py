"""Record one owner decision on 전략 개선 후보 (run only by the private strategy-decision workflow after an admin click on the site).
usage: strategy-decision.py --root <private data repo> --action approve|unapprove|apply [--id cNNN-...] [--run <workflow run id>]
Prints a GitHub notice; exits 1 with the reason when the decision does not fit the current status."""
import argparse, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from collector.strategy_candidates import ACTIONS, record

if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('--root', type=Path, required=True); p.add_argument('--action', choices=ACTIONS, required=True)
    p.add_argument('--id', default=''); p.add_argument('--run', default=''); a = p.parse_args()
    try:
        event = record(a.root, a.action, a.id or None, a.run or None)
    except ValueError as error:
        print(f'::error title=Strategy decision rejected::{error}'); sys.exit(1)
    target = event.get('id') or ', '.join(event['ids'])
    print(f'::notice title=Strategy decision::{event["action"]} {target} at {event["at"]}')
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as f:
            f.write(f'summary={event["action"]} {target}\n')
