"""KOSPI/KOSDAQ daily OHLC + volume for the 시장 현황 index charts (NAVER Finance price index, no login or secrets).

Writes data/live/market-indices.json. Reference display only: it never enters signals, scores or the simulation
(the simulation keeps its own simulation-indices.json / history-indices.json benchmark).
- Range: the last DAYS calendar days up to today in Seoul, fetched one calendar year per request so the
  provider cannot silently shorten a long response.
- NAVER returns the index volume in thousands of shares; it is stored in shares (x1000). The unit is checked
  against the sum of the collected stock volumes of the latest live session (data/live/daily) when that file exists.
- A session the exchange calendar knows but NAVER does not return is reported, never filled.
"""
import argparse
import ast
import csv
import json
import time
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DAYS = 400
VOLUME_SCALE = 1000  # NAVER index 거래량 is in 천주
URL = 'https://api.finance.naver.com/siseJson.naver?symbol={symbol}&requestType=1&startTime={start}&endTime={end}&timeframe=day'


def fetch(symbol, start, end):
    url = URL.format(symbol=symbol, start=start.replace('-', ''), end=end.replace('-', ''))
    request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.naver.com/'})
    last = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return ast.literal_eval(response.read().decode('utf-8-sig').strip())
        except Exception as error:
            last = error
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f'{symbol}: fetch failed: {last}')


def parse(records, start, end):
    """records: NAVER rows [날짜, 시가, 고가, 저가, 종가, 거래량, 외국인소진율] after the header."""
    prices = {}
    for values in records[1:]:
        stamp = str(values[0]).strip()
        day = f'{stamp[:4]}-{stamp[4:6]}-{stamp[6:8]}'
        if not start <= day <= end:
            continue
        o, h, l, c = map(float, values[1:5])
        if not 0 < l <= min(o, c) <= max(o, c) <= h:
            raise ValueError(f'{day}: invalid index OHLC')
        if day in prices:
            raise ValueError(f'{day}: duplicate index date')
        volume = values[5] if len(values) > 5 else None
        prices[day] = dict(date=day, open=o, high=h, low=l, close=c,
                           volume=None if volume in (None, '', 0) else int(float(volume) * VOLUME_SCALE))
    return prices


def collect(symbol, start, end):
    prices = {}
    for year in range(int(start[:4]), int(end[:4]) + 1):
        a, b = max(start, f'{year}-01-01'), min(end, f'{year}-12-31')
        for day, row in parse(fetch(symbol, a, b), a, b).items():
            if day in prices:
                raise ValueError(f'{symbol} {day}: duplicate across requests')
            prices[day] = row
        time.sleep(1)
    return prices


def stock_volume_check(root, prices, market):
    """Ratio of the index volume to the sum of the collected stock volumes on the latest live session (about 1 when the unit is right)."""
    files = sorted((root / 'data/live/daily').glob('*.csv'))
    if not files:
        return None
    day = files[-1].stem
    if day not in prices or not prices[day].get('volume'):
        return None
    total = 0
    with files[-1].open(encoding='utf-8-sig', newline='') as handle:
        for row in csv.DictReader(handle):
            if row['market'] == market and row['investor'] == '연기금 등' and row.get('volume'):
                total += int(float(row['volume']))
    return dict(date=day, index_volume=prices[day]['volume'], stock_volume_sum=total,
                ratio=round(prices[day]['volume'] / total, 4) if total else None)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--days', type=int, default=DAYS)
    args = parser.parse_args()
    end = datetime.now(ZoneInfo('Asia/Seoul')).date()
    start = (end - timedelta(days=args.days)).isoformat()
    end = end.isoformat()
    calendar_path = args.root / 'data/live/calendar.json'
    known = json.loads(calendar_path.read_text(encoding='utf-8')).get('sessions', []) if calendar_path.exists() else []
    result = dict(schema_version=1, source='NAVER Finance · KOSPI/KOSDAQ price indices (거래량 천주 → 주)',
                  collected_at=datetime.now(timezone.utc).isoformat(timespec='seconds'), first_date=start, indices={}, checks={})
    for market in ('KOSPI', 'KOSDAQ'):
        prices = collect(market, start, end)
        if not prices:
            raise ValueError(f'{market}: no rows')
        missing = sorted(d for d in known if start <= d <= max(prices) and d not in prices)
        if missing:
            print(f'::warning::{market}: NAVER rows missing for {len(missing)} calendar sessions, first {missing[:5]}')
        check = stock_volume_check(args.root, prices, market)
        if check and check['ratio'] is not None and not 0.5 <= check['ratio'] <= 2:
            print(f'::warning::{market}: index volume / stock volume sum = {check["ratio"]} on {check["date"]}; volume unit needs checking')
        result['indices'][market] = dict(prices=prices)
        result['checks'][market] = dict(sessions=len(prices), first=min(prices), last=max(prices), missing=missing, volume_vs_stocks=check)
        print(f'{market}: {len(prices)} sessions {min(prices)} ~ {max(prices)} · volume check {check}')
    result['as_of'] = max(max(v['prices']) for v in result['indices'].values())
    target = args.root / 'data/live/market-indices.json'
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps(result, ensure_ascii=False, allow_nan=False), encoding='utf-8')
    temporary.replace(target)


if __name__ == '__main__':
    main()
