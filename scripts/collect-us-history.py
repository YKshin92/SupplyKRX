"""Research only: daily closes of US indices and USD/KRW for long-period comparisons (no login, no secrets).

Writes {symbol: {date: close}} for S&P 500 (^GSPC), Nasdaq-100 (^NDX), Nasdaq Composite (^IXIC) and USD/KRW (KRW=X).
Dates are the exchange's local trading dates. Missing bars are left absent, never filled.
usage: collect-us-history.py --start 2018-10-01 --target data/us-indices.json
"""
import argparse, json, time, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

SYMBOLS = {'^GSPC': 'America/New_York', '^NDX': 'America/New_York', '^IXIC': 'America/New_York', 'KRW=X': 'Asia/Seoul'}
CHART = 'https://query1.finance.yahoo.com/v8/finance/chart/{}?period1={}&period2={}&interval=1d&includePrePost=false'
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)'}


def get(url):
    last = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.read().decode('utf-8-sig')
        except Exception as error:
            last = error
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f'fetch failed: {url}: {last}')


def closes(symbol, start, zone):
    p1 = int(datetime.fromisoformat(start).replace(tzinfo=timezone.utc).timestamp())
    p2 = int(time.time())
    data = json.loads(get(CHART.format(urllib.parse.quote(symbol), p1, p2)))['chart']['result'][0]
    quote = data['indicators']['quote'][0]
    out = {}
    for i, stamp in enumerate(data.get('timestamp') or []):
        c = quote['close'][i]
        if c is None or c <= 0:
            continue
        out[datetime.fromtimestamp(stamp, ZoneInfo(zone)).date().isoformat()] = round(float(c), 4)
    if len(out) < 250:
        raise ValueError(f'{symbol}: only {len(out)} bars')
    return dict(sorted(out.items()))


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--start', required=True)
    p.add_argument('--target', type=Path, required=True)
    a = p.parse_args()
    result = dict(schema_version=1, source='Yahoo Finance chart API (daily close)', collected_at=datetime.now(timezone.utc).isoformat(),
                  start=a.start, series={})
    for symbol, zone in SYMBOLS.items():
        result['series'][symbol] = closes(symbol, a.start, zone)
        s = result['series'][symbol]
        print(symbol, len(s), next(iter(s)), list(s)[-1], flush=True)
        time.sleep(1)
    a.target.parent.mkdir(parents=True, exist_ok=True)
    a.target.write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
