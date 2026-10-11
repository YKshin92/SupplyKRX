"""Run locally or inside the existing private build. Writes private outputs only."""
import argparse,csv,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from collector.core import load_rows
from collector.research import publish_research

parser=argparse.ArgumentParser()
parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1])
parser.add_argument('--target',type=Path)
args=parser.parse_args()
target=args.target or args.root/'public/data/live'
calendar=json.loads((args.root/'data/live/calendar.json').read_text(encoding='utf-8'))
result=publish_research(load_rows(args.root/'data/live'),calendar,target)
out=args.root/'outputs';out.mkdir(exist_ok=True)
summary=[];details=[]
for c in result['comparisons']:
    summary.append(dict(condition=c['label'],horizon=c['horizon'],split=c['split'],matched=c['total'],valid=c['net']['n'],
        mean_gross=c['gross']['mean'],mean_net=c['net']['mean'],median_net=c['net']['median'],win_pct=c['net']['win'],
        mean_excess=c['mean_excess'],avg_gain=c['net']['avg_gain'],avg_loss=c['net']['avg_loss'],worst=c['net']['worst'],best=c['net']['best'],
        without_top5pct=c['net']['without_top'],independent_dates=c['independent_dates'],missing_features=c['missing_features'],exclusions=json.dumps(c['exclusions'],ensure_ascii=False)))
for e in result['events']:
    for h,o in e['outcomes'].items():
        from collector.research import net_return
        item={k:v for k,v in e.items() if k not in ['outcomes','rules']};item['rules']='|'.join(e['rules'])
        item.update(horizon=int(h),**o);item['net']=net_return(o['gross']) if o['gross'] is not None else None
        details.append(item)
for name,items in [('신규순매수-조건별성과.csv',summary),('신규순매수-종목별성과.csv',details)]:
    keys=list(dict.fromkeys(k for item in items for k in item))
    with (out/name).open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=keys);w.writeheader();w.writerows(items)
def pct(v):return '—' if v is None else f'{v:+.2f}%'
report=f"# 신규 순매수 연구\n\n{result['first_date']}~{result['as_of']} · {result['sessions']}거래일 · {result['registered']}종목\n\n분할일: {result['split_date']} · 비용 및 슬리피지 왕복 합계 0.4% 가정\n\n"
for h in [5,10,20]:
    report+=f'## {h}거래일 보유\n\n| 조건 | 구간 | 평가 수 | 비용 전 평균 | 비용 후 평균 | 중앙값 | 상승 비율 | 평균 초과수익 | 상위 5% 제거 평균 |\n|---|---|---:|---:|---:|---:|---:|---:|---:|\n'
    for c in result['comparisons']:
        if c['horizon']!=h:continue
        report+=f"| {c['label']} | {c['split']} | {c['net']['n']} | {pct(c['gross']['mean'])} | {pct(c['net']['mean'])} | {pct(c['net']['median'])} | {pct(c['net']['win'])} | {pct(c['mean_excess'])} | {pct(c['net']['without_top'])} |\n"
    report+='\n'
report+='## 해석의 한계\n\n'+'\n'.join('- '+note for note in result['notes'])+'\n'
report+='\n## 매도 시 청산 대안\n\n최초 신호 다음 거래일 시가 진입 후, 최초 매도대금 발생을 확인한 다음 거래일 시가에 청산한다. 각 보유 기간 마지막 날까지 매도가 없으면 해당 마지막 날 종가에 청산한다. 비교 모집단은 전체 등록 종목이며 수급 결측 및 의심 가격은 제외한다.\n\n'
for h,s in result['sale_strategy'].items():report+=f"- {h}거래일 상한: 평가 {s['n']}건, 평균 {pct(s['mean'])}, 중앙값 {pct(s['median'])}, 상승 비율 {pct(s['win'])}\n"
report+='\n## 출처 처리 민감도\n\n'
for h,groups in result['provenance'].items():
    for name,s in groups.items():report+=f"- {h}일 {name}: 평가 {s['net']['n']}건, 비용 후 평균 {pct(s['net']['mean'])}\n"
report+='\n## 상위 25%의 최초 신호 지표 · 사후 공통점\n\n| 보유일 | 지표 | 상위 중앙값 | 나머지 중앙값 | 자료 수(상위/나머지) |\n|---|---|---:|---:|---:|\n'
for c in result['common']:
    report+=f"| {c['horizon']} | {c['feature']} | {c['top_median']} | {c['rest_median']} | {c['top_n']}/{c['rest_n']} |\n"
report+='\n## 시장·업종·시총·시기별 참고 분석\n\n업종·시총은 최신 메타데이터로 나눈 사후 비교다. 과거 진입 조건으로 사용할 수 없다.\n\n'
for key,items in result['groups'].items():
    report+=f'### {key}\n\n| 구간 | 보유일 | 평가 수 | 평균 | 중앙값 | 상승 비율 |\n|---|---|---:|---:|---:|---:|\n'
    for item in items:
        s=item['net'];report+=f"| {item['label']} | {item['horizon']} | {s['n']} | {pct(s['mean'])} | {pct(s['median'])} | {pct(s['win'])} |\n"
    report+='\n'
report+='## 가장 큰 상승·하락 사례\n\n'
for h in [5,10,20]:
    valid=[e for e in result['events'] if e['outcomes'][str(h)]['reason'] is None and not e['outcomes'][str(h)]['anomaly']]
    if not valid:continue
    ranked=sorted(valid,key=lambda e:e['outcomes'][str(h)]['gross'])
    for label,e in [('최저',ranked[0]),('최고',ranked[-1])]:
        report+=f"- {h}일 {label}: {e['name']}({e['code']}), 신호 {e['signal_date']}, 비용 후 {pct(net_return(e['outcomes'][str(h)]['gross']))}\n"
report+='\n## 조건 조합 결정\n\n10일 훈련 구간에서 표본 15건 이상, 비용 후 평균 및 초과수익 양수인 단독 조건의 중앙값 상위 두 개만 조합한다. 이후 검증 구간은 조건 선택에 사용하지 않는다.\n\n'
report+=('\n'.join('- '+r['label'] for r in result['rules'] if r.get('components')) or '기준을 통과한 단독 조건이 두 개 미만이므로 조합을 만들지 않았다.\n')
report+='\n## 지금 결과에서 관찰된 점\n\n'
for rule_id in ['all','not_hot','net5','foreign']:
    records=[c for c in result['comparisons'] if c['horizon']==10 and c['rule']==rule_id]
    for c in records:
        report+=f"- {c['label']} · {c['split']}: 평가 {c['net']['n']}건, 평균 {pct(c['net']['mean'])}, 중앙값 {pct(c['net']['median'])}, 상승 비율 {pct(c['net']['win'])}, 초과수익 {pct(c['mean_excess'])}.\n"
report+='\n큰 최초 순매수나 외국인 동반 순매수가 일관된 효과를 보이는지부터 확인해야 한다. 직전 급등 제한 조건은 탐색 후보이며, 검증 구간의 개선 폭과 시장 대비 초과수익을 함께 봐야 한다. 표본이 작은 조건의 높은 승률은 규칙 확정 근거로 삼지 않는다. 추가 과제는 더 긴 적재 기간, 신호일 당시 시총, 기업행사 수정주가, 상장폐지 포함 과거 종목 풀이다.\n'
(out/'신규순매수-연구보고서.md').write_text(report,encoding='utf-8')
print(json.dumps(dict(as_of=result['as_of'],registered=result['registered'],split_date=result['split_date'],
    summaries=[dict(label=c['label'],horizon=c['horizon'],split=c['split'],n=c['net']['n'],mean=c['net']['mean'],median=c['net']['median'],win=c['net']['win'],excess=c['mean_excess'],excluded=c['exclusions']) for c in result['comparisons'] if c['split']=='all']),ensure_ascii=False))
