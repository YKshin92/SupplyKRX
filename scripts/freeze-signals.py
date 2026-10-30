"""Record today's lab signals once, after the close, into the private immutable signal log."""
import argparse, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from collector.signal_lab import freeze_signal_log
if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('--root', type=Path, required=True); p.add_argument('--projection', type=Path, required=True); a = p.parse_args()
    print(json.dumps(freeze_signal_log(a.root, a.projection), ensure_ascii=False))
