"""Enrich protected, generated web JSON at build time; no additional browser downloads."""
import argparse
import json
import re
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from collector.touch_outcome import touch_outcome
from collector.foreign_record import foreign_record
from collector.price_comparison import price_comparison
from collector.corporate_context import published_reconciliation


def enrich(target, shard_limit=1_500_000):
    count = 0
    for root in ('tracking-history.json', 'tracking-events.json'):
        manifest_path = target/root
        if not manifest_path.exists():
            continue
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        sessions = manifest.get('sessions', [])
        files = manifest.get('files') or [root]
        cache = {}
        all_events = []
        prefix = root.removesuffix('.json')
        for filename in files:
            if filename != root and not re.fullmatch(re.escape(prefix)+r'-[a-z0-9-]+\.json', filename):
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
                event['price_comparison'] = price_comparison(event['signal_date'], cache[code]['pension'], sessions)
                event['current_return'] = ((event['current_close']/event['signal_close']-1)*100
                    if event['price_comparison']['status'] == 'comparable'
                    and event.get('current_close') and event.get('signal_close') else None)
                count += 1
            all_events.extend(events)
        batch, size, parts = [], 2, []
        def flush():
            filename = f'{prefix}-{len(parts):03}.json'
            encoded = json.dumps(batch, ensure_ascii=False, separators=(',', ':'))
            (target/filename).write_text(encoded, encoding='utf-8')
            parts.append(filename)
        for event in all_events:
            amount = len(json.dumps(event, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))
            if amount + 2 > shard_limit:
                raise ValueError('Single tracking event exceeds shard budget')
            if batch and size + amount + 1 > shard_limit:
                flush()
                batch, size = [], 2
            size += amount + (1 if batch else 0)
            batch.append(event)
        if batch:
            flush()
        manifest.update(files=parts, events=[])
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    # An older historical projection may replace the current live manifest.
    # Attach audited reconciliation after that overlay, without changing quotes.
    simulation_path=target/'simulation-input.json'
    if simulation_path.exists():
        simulation=json.loads(simulation_path.read_text(encoding='utf-8'))
        simulation['corporate_reconciliation']=published_reconciliation(simulation['sessions'][-1])
        simulation_path.write_text(json.dumps(simulation,ensure_ascii=False,separators=(',',':'),allow_nan=False),encoding='utf-8')
    return count


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--target', type=Path, required=True)
    args = parser.parse_args()
    print(f'Annotated {enrich(args.target)} private tracking events')
