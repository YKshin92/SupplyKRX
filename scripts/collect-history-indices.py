"""Collect full-range price-index benchmark; fail rather than silently shorten it."""
import argparse,ast,json,urllib.request
from datetime import datetime,timezone
from pathlib import Path
# Idle-cash options in the simulation: KRX-listed ETFs priced in won (the US ones include the exchange rate). Optional: a
# failed or incomplete ETF is left out with a warning so the KOSPI/KOSDAQ benchmark is never blocked by it.
ETFS={'ETF_KOSPI200':('069500','KODEX 200'),'ETF_SP500':('360750','TIGER 미국S&P500'),'ETF_NASDAQ100':('133690','TIGER 미국나스닥100')}
def fetch_year(symbol,wanted):
    url=f'https://api.finance.naver.com/siseJson.naver?symbol={symbol}&requestType=1&startTime={wanted[0].replace("-","")}&endTime={wanted[-1].replace("-","")}&timeframe=day'
    request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Referer':'https://finance.naver.com/'})
    with urllib.request.urlopen(request,timeout=40) as response:return ast.literal_eval(response.read().decode('utf-8-sig').strip())
def collect_etf(code,sessions):
    prices={}
    for year in sorted({d[:4] for d in sessions}):
        wanted=[d for d in sessions if d.startswith(year)]
        for row in fetch_year(code,wanted)[1:]:
            d=str(row[0]);d=f'{d[:4]}-{d[4:6]}-{d[6:8]}'
            if d not in wanted:continue
            o,h,l,c=map(float,row[1:5])
            if not 0<l<=min(o,c)<=max(o,c)<=h:raise ValueError(f'{code} {d}: invalid OHLC')
            if d in prices:raise ValueError(f'{code} {d}: duplicate')
            prices[d]=dict(date=d,open=o,high=h,low=l,close=c)
    missing=set(sessions)-prices.keys()
    if missing:raise ValueError(f'{code}: missing {len(missing)} dates, first {sorted(missing)[:5]}')
    days=sorted(prices)
    for x,y in zip(days,days[1:]):
        # A split or a bad row shows up as a jump no index ETF makes in a day.
        if abs(prices[y]['close']/prices[x]['close']-1)>.2 or abs(prices[y]['open']/prices[x]['close']-1)>.2:raise ValueError(f'{code} {y}: price jump, check for a split')
    return prices
def collect(sessions,target):
    result=dict(schema_version=1,source='NAVER Finance price index',collected_at=datetime.now(timezone.utc).isoformat(),first_date=sessions[0],as_of=sessions[-1],indices={})
    for market in ('KOSPI','KOSDAQ'):
        # Split by calendar year so the provider cannot silently truncate a long request.
        prices={}
        for year in sorted({d[:4] for d in sessions}):
            wanted=[d for d in sessions if d.startswith(year)]
            rows=fetch_year(market,wanted)
            for row in rows[1:]:
                d=str(row[0]);d=f'{d[:4]}-{d[4:6]}-{d[6:8]}'
                if d not in wanted:continue
                o,h,l,c=map(float,row[1:5]);assert 0<l<=min(o,c)<=max(o,c)<=h,(market,d)
                assert d not in prices,(market,d)
                prices[d]=dict(date=d,open=o,high=h,low=l,close=c)
        missing=set(sessions)-prices.keys()
        if missing:raise ValueError(f'{market}: missing {len(missing)} dates, first {sorted(missing)[:5]}')
        result['indices'][market]=dict(prices=prices);print(market,len(prices),flush=True)
    for key,(code,name) in ETFS.items():
        try:result['indices'][key]=dict(code=code,name=name,prices=collect_etf(code,sessions));print(key,code,len(result['indices'][key]['prices']),flush=True)
        except Exception as error:print(f'::warning::{name} ({code}) left out: {error}',flush=True)
    target.parent.mkdir(parents=True,exist_ok=True);tmp=target.with_suffix('.tmp');tmp.write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8');tmp.replace(target)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--sessions',type=Path,required=True);p.add_argument('--target',type=Path,required=True);a=p.parse_args();r=json.loads(a.sessions.read_text(encoding='utf-8'));collect(r.get('sessions') or r['expected_sessions'],a.target)

