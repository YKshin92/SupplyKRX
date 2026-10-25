"""Enrich protected, generated web JSON at build time; no additional browser downloads."""
import argparse
import json
import re
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from collector.touch_outcome import touch_outcome
from collector.foreign_record import foreign_record


def enrich(target):
    count = 0
    for root in ('tracking-history.json', 'tracking-events.json'):
        manifest_path = target/root
        if not manifest_path.exists():
            continue
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        sessions = manifest.get('sessions', [])
        files = manifest.get('files') or [root]
        cache = {}
        for filename in files:
            if filename != root and not re.fullmatch(r'tracking-history-[a-z0-9-]+\.json', filename):
                raise ValueError('Invalid tracking shard')
            path = target/filename
            data = json.loads(path.read_text(encoding='utf-8'))
            events = data if isinstance(data, list) else data['events']
            for event in events:
                code = event['code']
                if not re.fullmatch(r'[0-9A-Z]{6}', code):
                    raise ValueError('Invalid code')
                if code not in cache:
                    stock = target/f'history-stock-{code}.json'
                    history = json.loads(stock.read_text(encoding='utf-8')) if stock.exists() else {}
                    cache[code] = {key: {r['date']: r for r in history.get(key, [])} for key in ('pension', 'foreign')}
                event['touch_outcome'] = touch_outcome(event['signal_date'], cache[code]['pension'], sessions)
                event['foreign_record_20'] = foreign_record(event['signal_date'], cache[code]['foreign'], sessions)
                count += 1
            path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    return count


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--target', type=Path, required=True)
    args = parser.parse_args()
    print(f'Annotated {enrich(args.target)} private tracking events')
