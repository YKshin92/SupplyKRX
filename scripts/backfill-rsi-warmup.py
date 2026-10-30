"""Private one-time (re-runnable) warm-up history for Wilder RSI: raw closes and volumes before the live data.

Wilder RSI depends on its starting point, so the published value only settles after enough history.
This stores [open, high, low, close, volume, change_pct] (schema 3) for every KOSPI/KOSDAQ ticker on the N KRX sessions before the first live
daily file, using pykrx market-wide quotes (KRX_ID/KRX_PW from the environment; never printed).
Missing tickers stay null (not listed / no quote); nothing is filled or adjusted.
Output: data/live/rsi-warmup.json.gz (private repo only).
"""
import argparse
import contextlib
import gzip
import io
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))
from collector.pykrx_provider import call, ProviderError  # noqa: E402

parser = argparse.ArgumentParser()
parser.add_argument('--root', type=Path, required=True)
parser.add_argument('--sessions', type=int, default=250)
args = parser.parse_args()
if not os.getenv('KRX_ID') or not os.getenv('KRX_PW'):
    raise SystemExit('KRX_ID/KRX_PW required')
live = args.root / 'data/live'
first_live = min(p.stem for p in (live / 'daily').glob('*.csv'))
history = json.loads((args.root / 'data/history-indices.json').read_text(encoding='utf-8'))
krx_sessions = sorted(history['indices']['KOSPI']['prices'])
sessions = [d for d in krx_sessions if d < first_live][-args.sessions:]
if len(sessions) < 30:
    raise SystemExit(f'not enough KRX sessions before {first_live}')
target = live / 'rsi-warmup.json.gz'
previous = json.loads(gzip.decompress(target.read_bytes())) if target.exists() else None
if previous and previous.get('schema_version') != 3:
    previous = None  # older schemas lack OHLC or the exchange change rate; refetch
done = {}
if previous:  # resume: keep sessions already fetched
    for i, d in enumerate(previous['sessions']):
        done[d] = {c: v[i] for c, v in previous['stocks'].items() if v[i]}

with contextlib.redirect_stdout(io.StringIO()):
    from pykrx import stock

def save():
    codes = sorted({c for q in done.values() for c in q})
    kept = [d for d in sessions if d in done]
    payload = dict(schema_version=3, fields=['open', 'high', 'low', 'close', 'volume', 'change_pct'], source='KRX via pykrx get_market_ohlcv_by_ticker (원 시가·고가·저가·종가·거래량·등락률)',
                   collected_at=datetime.now(timezone.utc).isoformat(timespec='seconds'), first_live=first_live,
                   sessions=kept, stocks={c: [done[d].get(c) for d in kept] for c in codes})
    tmp = target.with_suffix('.tmp')
    tmp.write_bytes(gzip.compress(json.dumps(payload, separators=(',', ':')).encode('utf-8')))
    tmp.replace(target)


fetched = 0
for n, day in enumerate(sessions, 1):
    if day in done and done[day]:
        continue
    quotes = {}
    for market in ('KOSPI', 'KOSDAQ'):
        try:
            frame = call(stock.get_market_ohlcv_by_ticker, day.replace('-', ''), market=market)
        except ProviderError as error:
            print(f'{day} {market}: {error}', flush=True)
            continue
        for code, record in frame.iterrows():
            try:
                o, h, l, close, volume = (float(record[k]) for k in ('시가', '고가', '저가', '종가', '거래량'))
                try:
                    chg = round(float(record['등락률']), 2)
                except (KeyError, TypeError, ValueError):
                    chg = None
            except (KeyError, TypeError, ValueError):
                continue
            if close > 0:
                quotes[str(code)] = [int(o), int(h), int(l), int(close), int(volume), chg]
    done[day] = quotes
    print(f'{n}/{len(sessions)} {day}: {len(quotes)} tickers', flush=True)
    fetched += 1
    if fetched % 25 == 0:  # checkpoint so a timeout can resume
        save()
if fetched:
    save()
print(f'warm-up: {len([d for d in sessions if done.get(d)])}/{len(sessions)} sessions before {first_live}')
