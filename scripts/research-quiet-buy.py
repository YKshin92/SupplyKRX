"""Find large pension net purchases after low gross trading; private outputs."""
import csv,json,sys,statistics
from pathlib import Path
from collections import defaultdict
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from collector.core import load_rows

root=Path(__file__).resolve().parents[1]
rows=load_rows(root/'data/live')
cal=json.loads((root/'data/live/calendar.json').read_text(encoding='utf-8'))
hist=defaultdict(dict)
for r in rows:
    if r['investor']=='연기금 등':hist[r['code']][r['date']]=r
dates=sorted({r['date'] for h in hist.values() for r in h.values()})
events=[]
def ret(a,b):return (b/a-1)*100 if a and b and a>0 and b>0 else None
for code,h in hist.items():
    series=[h.get(d) for d in dates]
    for i in range(10,len(dates)):
        s=series[i];prev=series[i-10:i]
        if not s or s['net'] is None or s['net']<5e8:continue
        if any(not r or r['buy'] is None or r['sell'] is None for r in prev):continue
        if any(r['buy']>=1e8 or r['sell']>=1e8 for r in prev):continue
        latest=series[-1];path=series[i:]
        anomaly=any(a and b and a['close'] and b['close'] and
            (abs(ret(a['close'],b['close']))>45 or
             (b['change_pct'] is not None and abs(ret(a['close'],b['close'])-b['change_pct'])>10))
            for a,b in zip(path,path[1:]))
        prior20=series[i-20:i] if i>=20 else []
        avg=statistics.mean(r['buy']+r['sell'] for r in prev)
        meta=cal.get('instruments',{}).get(code,{})
        e=dict(code=code,name=s['name'],market=s['market'],signal_date=s['date'],
            signal_net_억원=s['net']/1e8,signal_buy_억원=s['buy']/1e8,signal_sell_억원=s['sell']/1e8,
            prior_max_buy_억원=max(r['buy'] for r in prev)/1e8,
            prior_max_sell_억원=max(r['sell'] for r in prev)/1e8,
            prior_avg_gross_억원=avg/1e8,prior_zero_days=sum(r['buy']==r['sell']==0 for r in prev),
            prior_absent_zero_days=sum(r.get('flow_status')=='absent_zero' for r in prev),
            quiet20=len(prior20)==20 and all(r and r['buy'] is not None and r['sell'] is not None and r['buy']<1e8 and r['sell']<1e8 for r in prior20),
            net_vs_prior_gross=s['net']/avg if avg>0 else None,
            quiet_window_price_return=ret(prev[0]['close'],prev[-1]['close']),
            signal_change=s['change_pct'],signal_close=s['close'],current_close=latest['close'] if latest else None,
            as_of=dates[-1],followup_days=len(dates)-1-i,
            since_signal_return=ret(s['close'],latest['close']) if latest else None,
            next_open_return=ret(series[i+1]['open'],latest['close']) if i+1<len(series) and series[i+1] and latest else None,
            max_close_return=max([ret(s['close'],r['close']) for r in path if r and r['close'] and s['close']] or [0]),
            price_anomaly=anomaly,latest_market_cap=meta.get('market_cap'),metadata_date=meta.get('metadata_date'),
            later_sell_days=sum(r['sell']>0 for r in series[i+1:] if r and r['sell'] is not None),
            followup_missing_days=sum(not r or r['close'] is None or r['sell'] is None for r in series[i+1:]))
        for n in [1,3,5,10,20]:
            end=series[i+n] if i+n<len(series) else None
            e[f'return_{n}d']=ret(s['close'],end['close']) if end else None
        events.append(e)
events.sort(key=lambda e:(e['signal_date'],e['signal_net_억원']),reverse=True)
out=root/'outputs';out.mkdir(exist_ok=True)
with (out/'저거래후-대규모순매수.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(events[0]) if events else ['code']);w.writeheader();w.writerows(events)
reference=[]
for h in hist.values():
    if any(r['name']=='알멕' for r in h.values()):
        reference=[{k:r[k] for k in ['date','name','buy','sell','net','close','change_pct','flow_status']} for d,r in sorted(h.items()) if d>='2026-09-01']
(out/'저거래후-대규모순매수.json').write_text(json.dumps(dict(as_of=dates[-1],events=events,reference=reference),ensure_ascii=False,indent=2),encoding='utf-8')
recent=[e for e in events if e['signal_date']>=dates[-20]]
def fmt(v):return '자료 부족' if v is None else f'{v:+.2f}%'
report=f'''# 저거래 이후 대규모 연기금 순매수 사례

데이터: {dates[0]}~{dates[-1]}, {len(dates)}거래일. 수급 및 가격 출처: 기존 비공개 KRX/pykrx 수집 데이터.

조건: 신호일 직전 10거래일의 **매수대금과 매도대금이 각각 매일 1억원 미만**, 신호일 **순매수 5억원 이상**. 미래 수익률로 종목을 선별하지 않았다. 전 기간 {len(events)}건 / {len(set(e['code'] for e in events))}종목, 최근 20거래일 내 신호 {len(recent)}건이다. 이전 10일간 0원이어야 한다는 기존 등록 조건보다 넓다. 재진입 사례는 별도 사건으로 보존한다.

수익률: 신호일 종가 대비 10월 8일 종가 변화이며 비용 전 가격 수익률이다. 관찰 기간이 다르므로 성과 순위로 해석하지 않는다. CSV의 다음날 시가 대비 수익률 및 동일 1/3/5/10/20거래일 수익률로 추가 비교 가능하다. 신호일 당일 상승률은 이후 수익률에 포함하지 않는다.

## 최근 20거래일 내 모든 사례

| 종목(코드) | 신호일 | 순매수(억원) | 이전 일평균 매수+매도(억원) | 거래 0일 수/10 | 신호일 등락률 | 이후 수익률 | 추적 거래일 | 이후 매도 발생일 수 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
'''
for e in recent:
    report+=f"| {e['name']}({e['code']}) | {e['signal_date']} | {e['signal_net_억원']:.2f} | {e['prior_avg_gross_억원']:.3f} | {e['prior_zero_days']} | {fmt(e['signal_change'])} | {fmt(e['since_signal_return'])} | {e['followup_days']} | {e['later_sell_days']} |\n"
report+='\n## 알멕 확인\n\n| 날짜 | 매수(억원) | 매도(억원) | 순매수(억원) | 종가(원) | 자료 상태 |\n|---|---:|---:|---:|---:|---|\n'
for r in reference:
    if r['date']>='2026-09-15':report+=f"| {r['date']} | {r['buy']/1e8:.4f} | {r['sell']/1e8:.4f} | {r['net']/1e8:.4f} | {r['close']:,} | {r['flow_status']} |\n"
report+='\n## 전 기간 동일 보유 기간 참고\n\n'
for n in [5,10,20]:
    vals=[e[f'return_{n}d'] for e in events if e[f'return_{n}d'] is not None and not e['price_anomaly'] and not e['followup_missing_days']]
    if vals:report+=f'- {n}거래일: {len(vals)}건, 비용 전 평균 {fmt(statistics.mean(vals))}, 중앙값 {fmt(statistics.median(vals))}, 상승 비율 {100*sum(v>0 for v in vals)/len(vals):.1f}%.\n'
report+='''
## 해석

- 매수가 큰 날은 추가 매수로 이어질 수 있으므로, 처음 조건을 만족한 날짜를 기준으로 산출했다. 직전 10일 안에 1억원 이상 거래가 있었다면 제외하여 연속 대규모 매수를 중복 신호로 잡지 않는다.
- 이전 20거래일까지 같은 저거래 조건을 만족하는지는 CSV의 quiet20으로 구분한다. 알멕은 9월 4일 매수 1.75억원 때문에 20일 조건에는 해당하지 않는다.
- 알멕은 10월 8일 매도대금 약 419만원도 발생했다. 따라서 '이후 매도대금이 전혀 없음' 조건을 추가하면 제외된다. 당일 순매수는 여전히 5.38억원이다.
- 신호일 상승이 이미 큰 사례도 있으며 상승이 매수 때문에 발생했다고 단정할 수 없다. 이 결과는 사후 사례 탐색이며 실전 수익이나 검증된 매수 전략이 아니다.
- absent_zero는 수집 응답에 없는 수급을 기존 정책에 따라 0으로 저장한 값이다. 원천이 명시적으로 보고한 거래 0과 구분하여 CSV에 해당 일수를 남겼다. 임의 결측은 조건 판정에서 제외했다.
- 최신 기준일은 10월 8일이다. 신호 이후 관측이 3~4일뿐인 최근 종목은 아직 5일 이상 성과가 없다. 수정주가/기업행동 조정이 완전하지 않으며 CSV에 급격한 가격 불일치를 표시한다.
- 시총은 10월 8일 메타데이터이며 과거 진입 조건에 사용하지 않았다. CSV 금액 컬럼은 이름에 적힌 억원 단위, 수익률은 퍼센트 단위이다.
'''
(out/'저거래후-대규모순매수-분석.md').write_text(report,encoding='utf-8')
assert any(e['code']=='354320' and e['signal_date']=='2026-10-01' and 6.82<e['signal_net_억원']<6.83 for e in events)
assert all(e['signal_net_억원']>=5 and e['prior_max_buy_억원']<1 and e['prior_max_sell_억원']<1 for e in events)
print(json.dumps(dict(as_of=dates[-1],events=len(events),stocks=len(set(e['code'] for e in events)),recent=len(recent),anomalies=sum(e['price_anomaly'] for e in events)),ensure_ascii=True))
