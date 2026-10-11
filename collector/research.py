"""Reproducible exploratory event study. No orders or public data publishing."""
from collections import defaultdict, Counter
from functools import lru_cache
import math
import random
import statistics as st
from .entry_events import build_entry_events
from .core import save_json

RULES = [
    dict(id='all', label='전체 신규 등록', feature=None, threshold=None),
    dict(id='net1', label='최초 순매수 ≥ 1억원', feature='signal_net', threshold=1e8),
    dict(id='net3', label='최초 순매수 ≥ 3억원', feature='signal_net', threshold=3e8),
    dict(id='net5', label='최초 순매수 ≥ 5억원', feature='signal_net', threshold=5e8),
    dict(id='flow_ratio', label='순매수 / 당일 거래대금 ≥ 1%', feature='flow_ratio', threshold=1),
    dict(id='foreign', label='외국인 당일 순매수', feature='foreign_net', threshold=0, strict=True),
    dict(id='foreign5', label='외국인 최근 5일 누적 순매수', feature='foreign5', threshold=0, strict=True),
    dict(id='ma20', label='종가 > 20일 이동평균', feature='above_ma20', threshold=0, strict=True),
    dict(id='not_hot', label='직전 5일 상승률 ≤ 10%', feature='prior5', threshold=10, upper=True),
    dict(id='volume', label='거래량 ≥ 직전 20일 평균의 1.5배', feature='volume_ratio', threshold=1.5),
]


def matches(event, rule):
    if rule.get('components'):
        return all(matches(event, r) for r in rule['components'])
    if rule['feature'] is None:
        return True
    value = event.get(rule['feature'])
    if value is None:
        return False
    if rule.get('upper'):
        return value <= rule['threshold']
    return value > rule['threshold'] if rule.get('strict') else value >= rule['threshold']


def missing_rule_feature(event, rule):
    if rule.get('components'):
        return any(missing_rule_feature(event, r) for r in rule['components'])
    return rule['feature'] is not None and event.get(rule['feature']) is None


def net_return(gross, cost_pct=.4):
    half = cost_pct / 200
    return ((1 + gross / 100) * (1-half) / (1+half)-1)*100


def describe(values):
    if not values:
        return dict(n=0, mean=None, median=None, win=None, win_ci=None, avg_gain=None, avg_loss=None,
                    best=None, worst=None, without_top=None)
    wins = [v for v in values if v > 0]
    losses = [v for v in values if v < 0]
    n = len(values); p = len(wins)/n; z = 1.96
    center = (p+z*z/(2*n))/(1+z*z/n)
    width = z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/(1+z*z/n)
    trim = max(1, math.ceil(n*.05))
    return dict(n=n, mean=st.mean(values), median=st.median(values), win=p*100,
                win_ci=[100*(center-width),100*(center+width)],
                avg_gain=st.mean(wins) if wins else None, avg_loss=st.mean(losses) if losses else None,
                best=max(values), worst=min(values), without_top=st.mean(sorted(values)[:-trim]) if n>trim else None)


def summarize(events, horizon, split='all', cost=.4, anomalies=False):
    chosen = [e for e in events if split=='all' or e['outcomes'][str(horizon)]['split']==split]
    counts=Counter(); valid=[]
    for e in chosen:
        o=e['outcomes'][str(horizon)]
        reason=o['reason']
        if reason:
            counts[reason]+=1
        elif o['anomaly'] and not anomalies:
            counts['price_anomaly']+=1
        else:
            valid.append((e,o))
    gross=[o['gross'] for e,o in valid]
    net=[net_return(v,cost) for v in gross]
    excess=[net_return(o['gross'],cost)-o['benchmark'] for e,o in valid if o['benchmark'] is not None]
    by_date=defaultdict(list)
    for e,o in valid:by_date[e['signal_date']].append(net_return(o['gross'],cost))
    bootstrap=[]; rng=random.Random(20261011); clusters=list(by_date.values())
    if len(clusters)>=2:
        for _ in range(300):
            sample=[v for _ in clusters for v in rng.choice(clusters)]
            bootstrap.append(st.mean(sample))
        bootstrap.sort()
    return dict(total=len(chosen), exclusions=dict(counts), gross=describe(gross), net=describe(net),
                mean_excess=st.mean(excess) if excess else None, benchmark_n=len(excess),
                mean_ci=[bootstrap[7],bootstrap[292]] if bootstrap else None, independent_dates=len(clusters),
                warning='표본 부족' if len(valid)<20 or len(clusters)<5 else '탐색 결과 · 확정 아님')


def build_research(rows, calendar):
    entries=build_entry_events(rows,calendar)
    first={}
    for event in sorted(entries['events'],key=lambda e:e['signal_date']):
        if event['no_trade_prior']:first.setdefault(event['code'],event)
    pension=defaultdict(dict);foreign=defaultdict(dict)
    for row in rows:
        (pension if row['investor']=='연기금 등' else foreign)[row['code']][row['date']]=row
    dates=[d for d in calendar['sessions'] if entries['first_date']<=d<=entries['as_of']]
    index={d:i for i,d in enumerate(dates)}
    cut=min(len(dates)-1,max(11,int(len(dates)*.6)))
    split_date=dates[cut]
    series={code:[history.get(d) for d in dates] for code,history in pension.items()}
    def valid_price(value):return value is not None and value>0
    def ret(a,b):return (b/a-1)*100 if valid_price(a) and valid_price(b) else None
    def closes(code, start, end):
        if start<0:return None
        values=[r.get('close') if r else None for r in series[code][start:end+1]]
        return values if len(values)==end-start+1 and all(valid_price(v) for v in values) else None
    @lru_cache(maxsize=None)
    def price_anomaly(code,start,end):
        for j in range(max(1,start),end+1):
            a,b=series[code][j-1:j+1]
            if not a or not b:continue
            change=ret(a.get('close'),b.get('close'))
            reported=b.get('change_pct')
            if change is not None and (abs(change)>45 or reported is not None and abs(change-reported)>10):return True
        return False
    @lru_cache(maxsize=None)
    def benchmark(market,start,end):
        values=[]
        for code,rs in series.items():
            a,b=rs[start],rs[end]
            if not a or not b or a['market']!=market or not a.get('volume') or not b.get('volume'):continue
            value=ret(a.get('open'),b.get('close'))
            if value is not None and not price_anomaly(code,start,end):values.append(value)
        return st.mean(values) if values else None
    events=[]
    for source in first.values():
        code=source['code']; i=index[source['signal_date']]; rs=series[code]; signal=rs[i]
        e={**source}
        e['signal_sell']=signal['sell'];e['signal_buy']=signal['buy']
        e['flow_ratio']=signal['net']/signal['turnover']*100 if signal.get('turnover') and signal['turnover']>0 else None
        f=foreign[code].get(dates[i]);e['foreign_net']=f['net'] if f else None
        f5=[foreign[code].get(d) for d in dates[max(0,i-4):i+1]]
        e['foreign5']=sum(r['net'] for r in f5) if len(f5)==5 and all(r and r['net'] is not None for r in f5) else None
        e['foreign_ratio']=e['foreign_net']/signal['turnover']*100 if e['foreign_net'] is not None and signal.get('turnover') else None
        e['signal_change']=signal.get('change_pct')
        for n in [5,10,20]:
            e[f'prior{n}']=ret(rs[i-n-1]['close'],rs[i-1]['close']) if i>=n+1 and rs[i-n-1] and rs[i-1] else None
            cs=closes(code,i-n+1,i)
            e[f'ma{n}']=st.mean(cs) if cs else None
        e['above_ma20']=signal['close']-e['ma20'] if valid_price(signal['close']) and e['ma20'] else None
        vs=[r.get('volume') if r else None for r in rs[max(0,i-20):i]]
        e['volume_ratio']=signal['volume']/st.mean(vs) if len(vs)==20 and all(v is not None for v in vs) and st.mean(vs)>0 and signal.get('volume') is not None else None
        cs=closes(code,i-20,i)
        e['volatility20']=st.stdev([(cs[j]/cs[j-1]-1)*100 for j in range(1,len(cs))]) if cs else None
        e['high_distance20']=(signal['close']/max(cs)-1)*100 if cs else None
        e['feature_price_anomaly']=price_anomaly(code,max(0,i-21),i)
        # Price indicators cannot cross an unadjusted corporate-action discontinuity.
        if e['feature_price_anomaly']:
            for k in ['prior5','prior10','prior20','ma5','ma10','ma20','above_ma20','volatility20','high_distance20']:e[k]=None
        quiet=0
        for r in reversed(rs[:i]):
            if not r or r.get('buy')!=0 or r.get('sell')!=0:break
            quiet+=1
        e['quiet_days']=quiet;e['quiet_censored']=quiet==i
        prior=rs[i-10:i];e['zero_filled_prior']=sum(r.get('flow_status')=='absent_zero' for r in prior)
        e['historical_cap']=None;e['historical_sector']=None
        # Current metadata may be used descriptively, never as a past entry condition.
        if source.get('metadata_date') and source['metadata_date']<=source['signal_date']:
            e['historical_cap']=source['market_cap'];e['historical_sector']=source['sector']
        e['outcomes']={}
        for horizon in [5,10,20]:
            start=i+1;end=i+horizon
            split='test' if i>=cut else 'train' if end<cut else 'purged'
            o=dict(split=split,reason=None,gross=None,benchmark=None,anomaly=False,entry_date=dates[start] if start<len(dates) else None,
                   exit_date=dates[end] if end<len(dates) else None,entry_open=None,exit_close=None,max_up=None,max_down=None,sale_exit=None)
            if end>=len(dates):o['reason']='insufficient_followup'
            elif not rs[start] or not rs[end] or not valid_price(rs[start].get('open')) or not valid_price(rs[end].get('close')):o['reason']='missing_price'
            elif not rs[start].get('volume') or not rs[end].get('volume'):o['reason']='no_trade_volume'
            elif closes(code,start,end) is None:o['reason']='missing_path'
            else:
                entry=rs[start]['open'];o.update(entry_open=entry,exit_close=rs[end]['close'],gross=ret(entry,rs[end]['close']),anomaly=price_anomaly(code,start,end))
                path=[ret(entry,r['close']) for r in rs[start:end+1]]
                o.update(max_up=max(path),max_down=min(path),benchmark=benchmark(source['market'],start,end))
                sale_end=None;sale_unknown=False
                for j in range(start,end):
                    if rs[j] is None or rs[j].get('sell') is None:sale_unknown=True;break
                    if rs[j]['sell']>0:sale_end=j+1;break
                if sale_unknown:o['sale_reason']='missing_sale_data'
                elif sale_end is None:
                    o['sale_exit']=o['gross'];o['sale_date']=dates[end];o['sale_anomaly']=o['anomaly']
                else:
                    if rs[sale_end] and rs[sale_end].get('volume') and valid_price(rs[sale_end].get('open')):
                        o['sale_exit']=ret(entry,rs[sale_end]['open']);o['sale_date']=dates[sale_end];o['sale_anomaly']=price_anomaly(code,start,sale_end)
                    else:o['sale_reason']='sale_exit_unavailable'
            e['outcomes'][str(horizon)]=o
        events.append(e)
    rules=[dict(r) for r in RULES]
    # One predeclared combination chosen using only purged 10-day training results.
    candidates=[]
    for rule in rules[1:]:
        group=[e for e in events if matches(e,rule)]
        summary=summarize(group,10,'train')
        if summary['net']['n']>=15 and summary['net']['mean']>0 and (summary['mean_excess'] or 0)>0:
            candidates.append((summary['net']['median'],rule))
    candidates.sort(key=lambda p:p[0],reverse=True)
    if len(candidates)>=2:
        a,b=candidates[0][1],candidates[1][1]
        rules.append(dict(id='combo',label=a['label']+' + '+b['label'],feature=None,threshold=None,components=[a,b]))
    for event in events:
        event['rules']=[r['id'] for r in rules if matches(event,r)]
        event['eligible_rules']=[r['id'] for r in rules if not missing_rule_feature(event,r)]
    comparisons=[]
    for horizon in [5,10,20]:
        for split in ['all','train','test']:
            for rule in rules:
                group=[e for e in events if rule['id'] in e['rules']]
                result=summarize(group,horizon,split)
                eligible=summarize([e for e in events if rule['id'] in e['eligible_rules']],horizon,split)
                result['eligible_baseline']=eligible['net']
                result.update(horizon=horizon,split=split,rule=rule['id'],label=rule['label'],missing_features=sum(missing_rule_feature(e,rule) for e in events))
                comparisons.append(result)
    groups={}
    for key in ['market','sector','signal_month']:
        values=defaultdict(list)
        for e in events:values[e['signal_date'][:7] if key=='signal_month' else e.get(key) or '미수집'].append(e)
        groups[key]=[{ 'label':label,'horizon':h,**summarize(items,h)} for label,items in values.items() for h in [5,10,20]]
    groups['cap']=[]
    for label,low,high in [('1,000억원 미만',0,1e11),('1,000~5,000억원',1e11,5e11),('5,000억원~1조원',5e11,1e12),('1조원 이상',1e12,float('inf'))]:
        items=[e for e in events if e['market_cap'] is not None and low<=e['market_cap']<high]
        groups['cap'] += [dict(label=label,horizon=h,**summarize(items,h)) for h in [5,10,20]]
    provenance={str(h):{kind:summarize([e for e in events if (e['zero_filled_prior']>0)==(kind=='zero_filled')],h) for kind in ['zero_filled','reported_zero']} for h in [5,10,20]}
    sale_strategy={str(h):describe([net_return(e['outcomes'][str(h)]['sale_exit']) for e in events if e['outcomes'][str(h)].get('sale_exit') is not None and not e['outcomes'][str(h)].get('sale_anomaly')]) for h in [5,10,20]}
    common=[]
    for h in [5,10,20]:
        valid=[e for e in events if e['outcomes'][str(h)]['reason'] is None and not e['outcomes'][str(h)]['anomaly']]
        ordered=sorted(valid,key=lambda e:e['outcomes'][str(h)]['gross'],reverse=True)
        count=max(1,math.ceil(len(ordered)/4));winners,others=ordered[:count],ordered[count:]
        for feature in ['signal_net','flow_ratio','foreign_net','foreign5','prior5','volume_ratio','above_ma20','volatility20']:
            a=[e[feature] for e in winners if e[feature] is not None];b=[e[feature] for e in others if e[feature] is not None]
            common.append(dict(horizon=h,feature=feature,top_n=len(a),rest_n=len(b),top_median=st.median(a) if a else None,rest_median=st.median(b) if b else None))
    return dict(schema_version=1,as_of=entries['as_of'],first_date=entries['first_date'],sessions=len(dates),registered=len(events),
                split_date=split_date,cost_default=.3,slippage_default=.1,lookback=10,rules=rules,events=events,comparisons=comparisons,
                groups=groups,provenance=provenance,sale_strategy=sale_strategy,common=common,
                notes=[
                    '진입은 최초 순매수 확인 후 다음 거래일 시가. h거래일 보유 종료는 신호일+h 거래일 종가.',
                    '최신 데이터셋의 종목 풀로 분석하므로 과거 상장폐지·편출 종목 누락 가능성이 남아 있습니다.',
                    '기업행사 수정주가가 없습니다. 일별 가격변화 45% 초과 또는 보고 등락률과 10%p 초과 차이는 의심 사례로 표시하며 기본 성과에서 제외합니다. 완전한 기업행사 검증은 아닙니다.',
                    '비용 0.3% + 슬리피지 0.1%는 왕복 총 가정이며 반씩 진입·청산 가격에 반영합니다. 실제 수수료·세율을 확인한 값이 아닙니다.',
                    '벤치마크는 같은 시장의 관측 종목을 같은 진입일 시가~종료일 종가로 계산한 동일가중 가격 수익률입니다. 공식 지수가 아니며 배당·비용은 미반영입니다.',
                    '훈련은 종료일이 분할일 이전인 사례만 사용하고, 검증은 신호일이 분할일 이후인 사례만 사용합니다. 경계를 가로지르는 사례는 훈련·검증에서 제외합니다.',
                    '시총·업종은 최신 메타데이터를 참고로만 비교합니다. 당시 자료가 없으므로 시총 대비 순매수 및 업종 진입 조건을 검증하지 않습니다.',
                    '수급의 정상 응답 미포함 0 처리와 보고된 0을 구분합니다. 결측을 0으로 바꾸지 않습니다.',
                    '원자료의 확정 상태는 unknown을 포함합니다. 파일 검증을 거래소의 최종 확정으로 해석하지 않습니다.',
                    '승률 구간은 Wilson 95%, 평균 구간은 신호 날짜 군집 부트스트랩 300회입니다. 날짜 간 의존·중첩 보유를 완전히 해결하지 않으므로 탐색용입니다.',
                    '모든 평균은 사건별 동일가중 수익률이며 포트폴리오 수익률이 아닙니다. 제한된 표본으로 자동매매 효과를 확정할 수 없습니다.'
                ])


def publish_research(rows,calendar,target):
    result=build_research(rows,calendar)
    save_json(target/'entry-research.json',result)
    return result
