/** 과거 8년(2019-01-02 ~ 2026-10-30) 연기금 매매법 검증 요약. 2026-11-04부터 3개월 조건은 '연기금 매수 0원 + 매도 합계 1억 미만'
 *  (11-02~11-03은 매수·매도 0원). 비공개 연구 apply-2026-11-04-c001-quiet-sell-under-1e8(result-after·check-after·trend-after·waits-after)의
 *  집계값만 담는다. 1억 원, 수수료·세금·이탈 매도·최소 300만 켬. */
type Row={label:string;final:number;total:number;cagr:number;mdd:number;h:number;r:number;year:number[]};
const YEARS=['2019','2020','2021','2022','2023','2024','2025','2026'];
export const STRATEGY:Row[]=[
 {label:'평가자산 15%',final:2.94,total:194.2,cagr:14.8,mdd:-13.4,h:76.2,r:67.0,year:[4.0,14.0,29.4,7.1,7.3,-1.1,37.9,22.5]},
 {label:'평가자산 20%',final:3.81,total:281.3,cagr:18.7,mdd:-16.2,h:94.1,r:96.5,year:[5.3,18.8,29.7,9.2,9.6,-1.6,52.9,30.5]},
 {label:'평가자산 25%',final:5.30,total:429.8,cagr:23.7,mdd:-21.0,h:128.7,r:131.6,year:[6.3,23.2,40.4,11.2,11.9,-2.0,69.2,39.7]},
 {label:'15% + KOSPI200 ETF',final:7.97,total:696.7,cagr:30.4,mdd:-40.9,h:138.4,r:234.1,year:[20.1,38.8,29.4,-15.8,31.4,-9.7,128.0,62.3]},
 {label:'20% + KOSPI200 ETF',final:9.21,total:820.9,cagr:32.8,mdd:-40.9,h:156.6,r:258.9,year:[22.3,39.8,29.5,-13.1,33.4,-9.8,139.9,65.9]},
 {label:'25% + KOSPI200 ETF',final:10.76,total:975.7,cagr:35.5,mdd:-40.9,h:179.3,r:285.1,year:[24.0,41.4,34.3,-12.3,35.3,-9.9,152.1,69.6]}];
/** Price returns (no dividends). S&P500 and Nasdaq-100 converted to won with USD/KRW; KOSPI200 is the KODEX 200 ETF NAVER adjusted price (distributions included). */
export const INDICES:{label:string;total:number;mdd:number;year:number[]}[]=[
 {label:'KOSPI',total:179.5,mdd:-40.0,year:[7.7,30.8,3.6,-24.9,18.7,-9.6,75.6,36.0]},
 {label:'KOSDAQ',total:6.2,mdd:-47.4,year:[-0.9,44.6,6.8,-34.3,27.6,-21.7,36.5,-21.7]},
 {label:'S&P500 (원화)',total:262.4,mdd:-30.4,year:[33.5,9.2,39.0,-14.7,26.0,41.6,14.0,3.0]},
 {label:'나스닥100 (원화)',total:437.5,mdd:-30.8,year:[42.9,38.7,38.7,-29.0,56.0,43.4,17.8,4.6]},
 {label:'KOSPI200 ETF',total:297.8,mdd:-41.9,year:[14.4,35.6,3.0,-24.1,24.9,-9.4,94.2,50.4]}];
const pct=(v:number)=>`${v>0?'+':v<0?'−':''}${Math.abs(v).toFixed(1)}%`;
const cls=(v:number)=>v>=0?'up':'down';
/** Per year: the strategy with the highest return, whether it beat every index that year, and the top index. */
const argmax=(v:number[])=>v.reduce((b,x,k)=>x>v[b]?k:b,0);
export const YEAR_BEST=YEARS.map((_,i)=>{const s=argmax(STRATEGY.map(r=>r.year[i])),x=argmax(INDICES.map(r=>r.year[i]));
 return {strategy:s,index:x,beatAll:STRATEGY[s].year[i]>INDICES[x].year[i]};});
const WINS=STRATEGY.map((_,k)=>YEAR_BEST.filter(b=>b.strategy===k).length);
export default function HistoryValidation(){
 return <details className="history-validation"><summary><span className="history-validation-star" aria-hidden="true">★</span><strong>과거 8년 검증 (2019~2026)</strong><em className="history-validation-badge">가장 신뢰할 근거</em><span className="history-validation-lead">1억 원 · 평가자산 15%씩 → 2.94억 원 (+194%) · 최대 낙폭 −13.4% · 같은 기간 KOSPI +180% (−40.0%)</span></summary>
  <p className="history-validation-why">이 전략을 판단할 때 가장 믿을 만한 자료입니다. 8년 동안 지금 화면과 같은 규칙으로 계산했습니다. 아래 짧은 기간 시뮬레이션보다 이 결과를 먼저 보세요.</p>
  <p><strong>2026-11-04 조건 변경</strong> 3개월 조건 '연기금 매수·매도 0원'을 '매수 0원 + 매도 합계 1억 미만'으로 조금 풀었습니다. 3개월 안에 소액만 판 종목(리밸런싱·잔여 정리일 가능성)은 다시 신호로 봅니다. 같은 8년에서 신호는 102건 → 116건(연 13 → 15건), 거래당 평균 +6.3% → +6.6%, 연평균(최대 낙폭)은 15% 12.1% → 14.8%(−12.7% → −13.4%), 20% 16.7% → 18.7%(−14.5% → −16.2%), 25% 19.2% → 23.7%(−16.7% → −21.0%), 15% + KOSPI200 ETF 28.2% → 30.4%입니다.</p>
  <p><strong>2026-11-02 조건 변경</strong> '직전 3개월 연기금 매수 0원'을 '매수·매도 0원(3개월 무거래)'으로 바꿨습니다. 최근에 팔던 종목을 다시 사는 경우를 빼는 조건입니다. 같은 8년에서 신호는 156건 → 102건, 거래당 평균은 +4.9% → +6.3%, 15% 계좌 최대 낙폭은 −19.5% → −12.7%가 됐습니다.</p>
  <p>규칙: 연기금 순매수 3억 이상, 직전 3개월 연기금 매수 0원 + 매도 합계 1억 미만, 신호일 거래량 20일 평균 3배 이하인 종목을 다음 날 시가에 사고 +30% 익절 / −10% 손절, 연기금 순매도 이탈 매도, 최소 300만 원, 수수료·세금 반영. 2019-01-02 ~ 2026-10-30, 1억 원으로 시작해 매수할 때마다 전날 평가자산의 15·20·25%를 샀고, 쉬는 현금은 그대로 두거나 KOSPI200 ETF(KODEX 200)에 넣었습니다.</p>
  <p className="history-validation-caption" id="hv-strategy">전략 결과 · 1억 원 시작</p>
  <div className="history-validation-scroll"><table className="history-validation-table wide" aria-labelledby="hv-strategy">
   <thead><tr><th scope="col">전략</th><th scope="col">최종</th><th scope="col">누적</th><th scope="col">연평균</th><th scope="col">최대 낙폭</th><th scope="col">2019~23</th><th scope="col">2024~26</th></tr></thead>
   <tbody>{STRATEGY.map(r=><tr key={r.label}><th scope="row">{r.label}</th><td>{r.final.toFixed(2)}억</td><td className={cls(r.total)}>{pct(r.total)}</td><td>{pct(r.cagr)}</td><td className="down">{pct(r.mdd)}</td><td className={cls(r.h)}>{pct(r.h)}</td><td className={cls(r.r)}>{pct(r.r)}</td></tr>)}</tbody>
  </table></div>
  <p className="history-validation-caption" id="hv-yearly">연도별 수익률 · 전략과 지수 (2026은 10/30까지, 지수는 가격 기준·배당 제외, KOSPI200 ETF는 분배금 포함)</p>
  <div className="history-validation-scroll"><table className="history-validation-table wide" aria-labelledby="hv-yearly">
   <thead><tr><th scope="col">연도</th>{STRATEGY.map(r=><th scope="col" key={r.label}>{r.label.replace('평가자산 ','').replace(' + KOSPI200 ETF','+ETF')}</th>)}{INDICES.map(x=><th scope="col" className="index" key={x.label}>{x.label.replace(' (원화)','')}</th>)}</tr></thead>
   <tbody>{YEARS.map((y,i)=><tr key={y}><th scope="row">{y}</th>{STRATEGY.map((r,k)=>{const best=YEAR_BEST[i].strategy===k,star=best&&YEAR_BEST[i].beatAll;
     return <td key={r.label} className={`${cls(r.year[i])}${best?' best':''}`} title={best?(star?'그해 1위 전략 · 모든 지수보다 높음':'그해 1위 전략'):undefined}>{pct(r.year[i])}{star&&<span className="best-star" aria-hidden="true">★</span>}{best&&<span className="sr-only">{star?' (그해 1위, 모든 지수보다 높음)':' (그해 1위)'}</span>}</td>;})}
     {INDICES.map((x,k)=><td key={x.label} className={`index ${cls(x.year[i])}${YEAR_BEST[i].index===k?' idx-best':''}`} title={YEAR_BEST[i].index===k?'그해 1위 지수':undefined}>{pct(x.year[i])}</td>)}</tr>)}
    <tr className="total"><th scope="row">누적</th>{STRATEGY.map(r=><td key={r.label} className={cls(r.total)}>{pct(r.total)}</td>)}{INDICES.map(x=><td key={x.label} className={`index ${cls(x.total)}`}>{pct(x.total)}</td>)}</tr>
    <tr className="total mdd"><th scope="row">최대 낙폭</th>{STRATEGY.map(r=><td key={r.label} className="down">{pct(r.mdd)}</td>)}{INDICES.map(x=><td key={x.label} className="index down">{pct(x.mdd)}</td>)}</tr>
    <tr className="total wins"><th scope="row">1위 횟수</th>{WINS.map((n,k)=><td key={STRATEGY[k].label} className={n===Math.max(...WINS)?'most':''}>{n?`${n}회`:'—'}</td>)}{INDICES.map(x=><td key={x.label} className="index"/>)}</tr></tbody>
  </table></div>
  <p className="history-validation-legend"><span className="swatch" aria-hidden="true"/>그해 1위 전략 <span className="best-star" aria-hidden="true">★</span> 그 전략이 그해 모든 지수보다 높음 · <b>굵은 지수</b>는 그해 1위 지수</p>
  <p className="history-validation-pattern">KOSPI가 오른 해(2019·2020·2023·2025·2026)에는 쉬는 현금을 ETF에 둔 전략이, 제자리이거나 내린 해(2021·2022·2024)에는 현금을 들고 있던 전략이 1위였습니다. 어느 한 전략이 매년 이기지는 않습니다.</p>
  <p className="history-validation-note">15%·20%·25%는 매수 비중, ‘+ETF’는 쉬는 현금을 KOSPI200 ETF에 둔 경우입니다. S&P500·나스닥100은 원화 환산(원/달러 +19.9%)이며 달러 기준으로는 +202.4%, +348.4%입니다.</p>
  <p><strong>읽는 법</strong> 매매법만(15%)으로도 같은 기간 KOSPI보다 수익이 조금 높고(+194% vs +180%) 최대 낙폭은 3분의 1입니다(−13.4% vs −40.0%). 비중을 20·25%로 올리면 수익이 커지고 낙폭도 −16.2%, −21.0%로 커집니다. 쉬는 현금을 KOSPI200 ETF에 두면 수익이 크게 늘지만 자금 대부분이 지수에 있어 낙폭이 지수 수준(−40.9%, 2026년 7월 급락)이 되고 2022년(−12~−16%)·2024년(−10%) 같은 해가 생깁니다. 수익의 큰 부분은 2025~2026년 KOSPI200 급등(+94%, +50%)에서 나왔습니다.</p>
  <p><strong>점검에서 확인한 것</strong> 바꾸기 전 조건(3개월 매수·매도 0원)으로 같은 입력을 계산하면 이전 카드 숫자(15% 2.45억 등 여섯 줄 모두)가 그대로 나옵니다. 새 조건에서 평가가 멈춘 날은 없고, 상장폐지·합병 종목은 마지막 거래가로 정산했습니다. 현금이 모자라 늦게 산 경우는 15%에서 0건, 20%에서 3건(최대 3거래일)이고, 25%는 현금 그대로 10건(최대 42거래일)·ETF 6건(최대 11거래일)으로 늘어 25%는 ‘다음 날 시가 매수’와 다른 체결이 섞입니다. 시작 달을 2019년 1~12월로 바꿔도 15%는 연평균 14.1~15.7%, 25%는 22.5~25.3%입니다. 이탈 매도를 끄면 15%는 14.8% → 14.5%로 비슷하고 25%는 23.7% → 22.0%로 낮아집니다. 2026년 KOSPI의 큰 등락(7/31 하루 +17.9% 등)은 실제 시장 기록과 일치합니다. 거래세를 연도별로 다르게(0.15~0.30%) 잡아도 연평균 차이는 15%가 −0.3~+0.1%p, 25%가 −0.4~+0.3%p입니다.</p>
  <p><strong>주의할 점</strong> ① 3개월 조건(11-02 매수·매도 0원, 11-04 매도 1억 미만 허용)은 이 8년 결과를 본 뒤 정한 것이라, 2019~2023년도 더는 '규칙을 정할 때 안 쓴 기간'이 아닙니다. 특히 11-04에 늘어난 신호는 14건뿐이고(날짜 묶음 t 1.87, 기준 2 미만) 성과가 익절 몇 건에 기댑니다. 앞으로 쌓이는 실제 신호로 다시 확인해야 합니다. ② 신호가 연 15건으로 적고 94개월 중 35개월은 신호가 없습니다. ③ 자산이 커지면 주문이 커집니다. 25%+ETF는 2026년 주문 중간값이 약 2.4억 원이고, 2025~2026년에는 신호일 거래대금의 27~28%를 사는 주문도 있어 실제로는 그 가격에 다 사기 어렵습니다. ④ ETF는 소수 단위로 사고팔았다고 계산했고, NAVER 수정주가라 분배금이 재투자된 효과가 들어 있습니다(분배금 세금 15.4% 미반영, 연 약 0.3%p 과대).</p>
  <p><strong>2019~2023년 규칙 검증 (바꾸기 전 조건 기준)</strong> 3개월 무매수가 1·2개월보다 나음, 조건을 좁힐수록 좋아지는 방향은 같지만 차이가 작아짐, +30%/−10%는 그 기간엔 더 넓은 폭이 나았음, 연기금 순매도 이탈 매도는 영향이 작음, 외국인 최대 순매도일 제외·음봉 우선·KOSPI 200일선 규칙은 근거 없음. 무매수 기간을 2·1개월로 줄이거나 거래량 상한을 풀면 늘어난 신호의 평균이 0% 안팎이라 결과가 나빠졌습니다. 3개월 매도를 1억 미만까지 허용하면 늘어난 14건의 평균이 2019~23 +8.6%, 2024~26 +9.0%였고, 1억~3억을 판 종목은 약 +4%, 3억 이상 판 종목이 성과를 깎았습니다.</p>
  <p><strong>쉬는 현금 ETF에 200일선 필터를 걸면</strong> KOSPI200 ETF가 200일선 위일 때만 들고 아래면 현금으로 두는 방식(전날 종가로 판단, 다음 날 시가 매매)을 미리 기준을 정해 계산했습니다. 새 조건에서 15%는 7.97억 → 6.17억(−23%), 25%는 10.76억 → 8.18억(−24%)으로 줄었습니다. 2019~2023년 낙폭은 −34% → −17%로 줄었지만, 2026년 7월 급락은 지수가 200일선보다 훨씬 위에서 시작돼 피하지 못해 최대 낙폭은 −40.9% 그대로였습니다. 8년 동안 37%의 날을 현금으로 보냈고 31번 팔았습니다. 채택하지 않았습니다.</p>
  <p>수수료 0.015%·증권거래세 0.20%(2026년 세율)를 모든 연도에 같게 적용했습니다. 사후 계산이며 수익을 보장하지 않고 투자 권유가 아닙니다.</p>
 </details>;
}
