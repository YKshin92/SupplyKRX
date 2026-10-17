"""Fetch public index OHLC into ignored local data; no login or secrets."""
import argparse
import ast
from datetime import datetime, timezone
import json
from pathlib import Path
import urllib.request
import time

ROOT = Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=ROOT);ROOT=parser.parse_args().root
files = sorted((ROOT/'data/live/daily').glob('*.csv'))
start,end = files[0].stem,files[-1].stem
calendar = json.loads((ROOT/'data/live/calendar.json').read_text(encoding='utf-8'))
sessions = [d for d in calendar['sessions'] if start <= d <= end]
result = dict(schema_version=1,source='NAVER Finance · KOSPI/KOSDAQ price indices',
    collected_at=datetime.now(timezone.utc).isoformat(), first_date=start,as_of=end,indices={})
for market in ('KOSPI','KOSDAQ'):
    url = f'https://api.finance.naver.com/siseJson.naver?symbol={market}&requestType=1&startTime={start.replace("-","")}&endTime={end.replace("-","")}&timeframe=day'
    req = urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Referer':'https://finance.naver.com/'})
    with urllib.request.urlopen(req,timeout=30) as response:
        raw = response.read().decode('utf-8-sig')
    records = ast.literal_eval(raw.strip())
    prices = {}
    for values in records[1:]:
        stamp = str(values[0]); day = f'{stamp[:4]}-{stamp[4:6]}-{stamp[6:8]}'
        if day not in sessions: continue
        o,h,l,c = map(float,values[1:5])
        if not 0 < l <= min(o,c) <= max(o,c) <= h:
            raise ValueError(f'{market} {day}: invalid index OHLC')
        if day in prices: raise ValueError('Duplicate index date')
        prices[day] = dict(date=day,open=o,high=h,low=l,close=c)
    missing = set(sessions)-prices.keys()
    if missing: raise ValueError(f'{market}: missing sessions {sorted(missing)}')
    result['indices'][market] = dict(url=url,prices=prices)
    print(f'{market}: {len(prices)} sessions / {min(prices)} ~ {max(prices)}')
    time.sleep(1)
target = ROOT/'data/live/simulation-indices.json'
temporary = target.with_suffix('.tmp')
temporary.write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
temporary.replace(target)
