"""Fetch the full daily history of SOXX (iShares Semiconductor ETF) for the 시장 현황 '반도체 지수' view; no login or secrets.

- Source: Yahoo Finance chart API, range=max, daily bars. `close` there is split-adjusted, not dividend-adjusted
  (the same basis as a TradingView price chart), so long-term levels match charts quoted by traders.
- Only completed sessions are kept: a bar dated today in New York is dropped until 16:20 New York time.
- Output: <root>/data/live/semis.json {schema_version, symbol, name, source, fetched_at, as_of, prices:[[date,o,h,l,c,v]...]}.
The file is reference data for the chart only; it never enters signals, scores or the simulation.
"""
import argparse
import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

URL = 'https://query1.finance.yahoo.com/v8/finance/chart/{}?range=max&interval=1d&includePrePost=false&events=split'
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)'}
NY = ZoneInfo('America/New_York')
SYMBOL, NAME = 'SOXX', 'iShares Semiconductor ETF'


def get(url):
    last = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return r.read().decode('utf-8')
        except Exception as error:
            last = error
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f'fetch failed: {url}: {last}')


def bars(symbol, now=None):
    data = json.loads(get(URL.format(symbol)))['chart']['result'][0]
    q = data['indicators']['quote'][0]
    now = now or datetime.now(NY)
    today_open = now.strftime('%Y-%m-%d') if (now.hour, now.minute) < (16, 20) else None
    out = []
    for i, ts in enumerate(data['timestamp']):
        day = datetime.fromtimestamp(ts, NY).strftime('%Y-%m-%d')
        o, h, l, c, v = (q[k][i] for k in ('open', 'high', 'low', 'close', 'volume'))
        if day == today_open or None in (o, h, l, c) or min(o, h, l, c) <= 0:
            continue
        row = [day, round(o, 4), round(h, 4), round(l, 4), round(c, 4), int(v or 0)]
        if out and out[-1][0] == day:
            out[-1] = row
        else:
            out.append(row)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', type=Path, required=True)
    a = ap.parse_args()
    prices = bars(SYMBOL)
    if len(prices) < 4000 or prices[0][0] > '2002-01-01':
        raise SystemExit(f'SOXX history looks incomplete: {len(prices)} bars from {prices[0][0] if prices else None}')
    out = dict(schema_version=1, symbol=SYMBOL, name=NAME, source='Yahoo Finance chart API (split-adjusted close)',
               fetched_at=datetime.now(timezone.utc).isoformat(timespec='seconds'), as_of=prices[-1][0], prices=prices)
    path = a.root / 'data/live/semis.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'SOXX: {len(prices)} sessions {prices[0][0]} ~ {prices[-1][0]}')


if __name__ == '__main__':
    main()
