"""Fetch real missing OHLCV, verify adjacent KRX prices, save local supplements."""
import argparse
import ast
from concurrent.futures import ThreadPoolExecutor,as_completed
from datetime import datetime,timedelta,timezone
import hashlib
import json
from pathlib import Path
import sys
import threading
import time
import urllib.request
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from collector.simulation import load_histories
from collector.simulation_prices import needs_quote,REPAIR_FIELDS,verify_anchors


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--codes',default='');parser.add_argument('--root',type=Path,default=ROOT);args=parser.parse_args();data_root=args.root
    histories=load_histories(data_root/'data/live/daily')
    selected=set(args.codes.split(',')) if args.codes else None
    holes={code:[r for r in hist.values() if needs_quote(r)] for code,hist in histories.items() if selected is None or code in selected}
    holes={code:rows for code,rows in holes.items() if rows}
    path=data_root/'data/live/simulation-price-overrides.json'
    dataset=json.loads(path.read_text(encoding='utf-8')) if path.exists() else dict(schema_version=1,quotes={})
    audit=[];lock=threading.Lock();last=[0.0]
    cache=data_root/'work/price-repair/source';cache.mkdir(parents=True,exist_ok=True)
    print(f'Candidates: {sum(map(len,holes.values()))} dates / {len(holes)} stocks (zero-volume suspensions excluded)',flush=True)

    def download(url,referer='https://finance.naver.com/'):
        with lock:
            time.sleep(max(0,.5-(time.monotonic()-last[0])));last[0]=time.monotonic()
        request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Referer':referer})
        with urllib.request.urlopen(request,timeout=25) as response:return response.read()

    def fetch(code,targets):
        dates=sorted(histories[code]);history=histories[code]
        start=(datetime.fromisoformat(min(r['date'] for r in targets))-timedelta(days=15)).strftime('%Y%m%d')
        end=max(r['date'] for r in targets).replace('-','')
        url=f'https://api.finance.naver.com/siseJson.naver?symbol={code}&requestType=1&startTime={start}&endTime={end}&timeframe=day'
        try:
            raw=download(url)
            (cache/f'{code}-{end}.txt').write_bytes(raw)
            records=ast.literal_eval(raw.decode('utf-8-sig').strip())
            bars={}
            for values in records[1:]:
                stamp=str(values[0]);day=f'{stamp[:4]}-{stamp[4:6]}-{stamp[6:8]}'
                fields={k:float(v) for k,v in zip(('open','high','low','close','volume'),values[1:6])}
                if any(not __import__('math').isfinite(v) or v<0 or not v.is_integer() for v in fields.values()):continue
                fields={k:int(v) for k,v in fields.items()}
                if day in bars:raise ValueError('duplicate source date')
                bars[day]=fields
            cross_url=f'https://fchart.stock.naver.com/sise.nhn?symbol={code}&timeframe=day&count=100&requestType=0'
            cross_raw=download(cross_url)
            (cache/f'{code}-{end}.xml').write_bytes(cross_raw)
            cross_bars={}
            chart_root=ET.fromstring(cross_raw.decode('euc-kr'))
            identity=next(chart_root.iter('chartdata')).attrib
            if identity.get('symbol')!=code:raise ValueError('source symbol conflict')
            for item in chart_root.iter('item'):
                values=item.attrib['data'].split('|');stamp=values[0]
                cross_bars[f'{stamp[:4]}-{stamp[4:6]}-{stamp[6:8]}']={k:int(v) for k,v in zip(('open','high','low','close','volume'),values[1:6])}
            verified=[];issues=[]
            for target in targets:
                day=target['date'];q=bars.get(day)
                if not q or not all(q[k]>0 for k in ('open','high','low','close','volume')):
                    issues.append(dict(code=code,date=day,status='no_traded_quote'));continue
                if not q['low']<=min(q['open'],q['close'])<=max(q['open'],q['close'])<=q['high']:
                    issues.append(dict(code=code,date=day,status='invalid_source_ohlc'));continue
                if cross_bars.get(day)!=q:
                    issues.append(dict(code=code,date=day,status='source_crosscheck_conflict'));continue
                anchors,policy=verify_anchors(history,bars,day,identity)
                if not policy:
                    issues.append(dict(code=code,date=day,status='anchor_missing_or_adjusted_price_conflict',anchors=anchors));continue
                differences=[dict(date=d,field=k,krx=history[d][k],naver=bars[d][k]) for d in anchors for k in ('high','low','close') if history[d][k]!=bars[d][k]]
                if any(target.get(k) is not None and target[k]!=q.get(k) for k in ('open','high','low','close','volume')):
                    issues.append(dict(code=code,date=day,status='existing_price_conflict'));continue
                # Derive change only if the exact preceding collected session matches the source close.
                previous=dates[dates.index(day)-1] if dates.index(day)>0 else None
                previous_close=bars.get(previous,{}).get('close')
                if previous_close and history[previous].get('close')==previous_close:
                    q['change_pct']=(q['close']/previous_close-1)*100
                verified.append((code+':'+day,dict(status='verified',source='NAVER Finance supplemental OHLCV',url=url,
                    fetched_at=datetime.now(timezone.utc).isoformat(),source_sha256=hashlib.sha256(raw).hexdigest(),
                    crosscheck_url=cross_url,crosscheck_sha256=hashlib.sha256(cross_raw).hexdigest(),
                    anchors=anchors,anchor_policy=policy,source_identity=identity,anchor_price_differences=differences,
                    base={k:target.get(k) for k in REPAIR_FIELDS},quote=q)))
            return verified,issues
        except Exception as exc:
            return [],[dict(code=code,status='fetch_or_parse_failed',error=type(exc).__name__)]

    done=0;added=0
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures={pool.submit(fetch,code,rows):code for code,rows in holes.items()}
        for future in as_completed(futures):
            quotes,issues=future.result();audit.extend(issues)
            for key,value in quotes:dataset['quotes'][key]=value
            added+=len(quotes);done+=1
            if done%20==0 or done==len(holes):print(f'Checked {done}/{len(holes)} stocks; verified {added}; unresolved {len(audit)}',flush=True)
    dataset['updated_at']=datetime.now(timezone.utc).isoformat()
    temporary=path.with_suffix('.tmp');temporary.write_text(json.dumps(dataset,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8');temporary.replace(path)
    report=dict(added=added,total_supplements=len(dataset['quotes']),candidate_stocks=len(holes),issues=audit,updated_at=dataset['updated_at'])
    target=data_root/'outputs/simulation';target.mkdir(parents=True,exist_ok=True)
    (target/'price-repair-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(dict(added=added,total_supplements=len(dataset['quotes']),unresolved=len(audit)),ensure_ascii=False),flush=True)


if __name__=='__main__':main()
