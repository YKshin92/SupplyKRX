"""Fetch US reference data for RSI monitoring into the private data repo; no login or secrets.

- Ranking: companiesmarketcap.com US list (CSV), taken at collection time. The cap date is the
  collection date in New York, not a historical composition, and is never applied to past dates.
- Prices: Yahoo Finance chart API daily bars. `close` there is split-adjusted, not dividend-adjusted.
  Only completed sessions are kept: a bar dated today in New York is dropped until the market has closed.
- Indices: S&P 500 (^GSPC) and Nasdaq Composite (^IXIC).
The output is monitoring reference data only; it never enters signals, scores or the simulation.
"""
import argparse
import csv
import io
import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
CAP_URL = 'https://companiesmarketcap.com/usa/largest-companies-in-the-usa-by-market-cap/?download=csv'
CHART = 'https://query1.finance.yahoo.com/v8/finance/chart/{}?range=2y&interval=1d&includePrePost=false'
INDICES = {'S&P500': '^GSPC', 'NASDAQ': '^IXIC'}
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)'}
NY = ZoneInfo('America/New_York')


def get(url):
    last = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.read().decode('utf-8-sig')
        except Exception as error:  # network hiccups and 429s: back off and retry
            last = error
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f'fetch failed: {url}: {last}')


def ranking(top):
    rows = list(csv.DictReader(io.StringIO(get(CAP_URL))))
    out = []
    for r in rows:
        if r.get('country') != 'United States':
            continue
        symbol = r['Symbol'].strip().upper()
        cap = float(r['marketcap'])
        if not symbol or cap <= 0 or any(x['symbol'] == symbol for x in out):
            continue
        out.append(dict(rank=len(out) + 1, symbol=symbol, name=r['Name'].strip(), market_cap_usd=int(cap)))
        if len(out) == top:
            break
    if len(out) < top:
        raise ValueError(f'US ranking has only {len(out)} companies')
    return out


def bars(symbol, now):
    data = json.loads(get(CHART.format(urllib.parse.quote(symbol))))['chart']['result'][0]
    quote = data['indicators']['quote'][0]
    today = now.astimezone(NY).date().isoformat()
    closed = now.astimezone(NY).hour >= 17  # 16:00 close plus a margin for the final print
    prices = {}
    for i, stamp in enumerate(data.get('timestamp') or []):
        day = datetime.fromtimestamp(stamp, NY).date().isoformat()
        if day == today and not closed:
            continue
        o, h, l, c, v = (quote[k][i] for k in ('open', 'high', 'low', 'close', 'volume'))
        if c is None or c <= 0:
            continue  # missing bar: left absent, never filled
        prices[day] = dict(date=day, open=o, high=h, low=l, close=round(float(c), 4), volume=int(v or 0))
    return prices


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--top', type=int, default=30)
    args = parser.parse_args()
    now = datetime.now(timezone.utc)
    result = dict(schema_version=1, collected_at=now.isoformat(timespec='seconds'), cap_date=now.astimezone(NY).date().isoformat(),
                  cap_source='companiesmarketcap.com (수집 시점 순위)', price_source='Yahoo Finance chart API (분할 조정 종가)',
                  indices={}, stocks=[])
    for name, symbol in INDICES.items():
        result['indices'][name] = dict(symbol=symbol, prices=bars(symbol, now))
        print(f"{name}: {len(result['indices'][name]['prices'])} sessions")
    for item in ranking(args.top):
        try:
            item['prices'] = bars(item['symbol'].replace('.', '-'), now)
        except Exception as error:
            item['prices'] = {}
            item['error'] = str(error)[:200]
        result['stocks'].append(item)
        time.sleep(0.4)
    missing = [s['symbol'] for s in result['stocks'] if not s['prices']]
    print(f"US top {len(result['stocks'])}: price missing {missing or 'none'}")
    target = args.root / 'data/live/us-market.json'
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps(result, ensure_ascii=False, allow_nan=False), encoding='utf-8')
    temporary.replace(target)


if __name__ == '__main__':
    main()
