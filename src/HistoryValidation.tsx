/** 과거 8년(2019-01-02 ~ 2026-10-30) 연기금 매매법 검증 요약. 비공개 연구 history-validation-2026-11-01(규칙 검증)과
 *  history8-update-2026-11-02(현재 사이트 규칙 재계산·지수 비교·점검)의 집계값만 담는다. 1억 원, 수수료·세금·이탈 매도·최소 300만 켬. */
type Row={label:string;final:number;total:number;cagr:number;mdd:number;h:number;r:number;year:number[]};
const YEARS=['2019','2020','2021','2022','2023','2024','2025','2026'];
export const STRATEGY:Row[]=[
 {label:'평가자산 15%',final:2.77,total:177.0,cagr:13.9,mdd:-19.5,h:44.9,r:91.2,year:[4.4,13.1,18.1,-0.1,4.0,6.4,39.9,28.4]},
 {label:'평가자산 20%',final:3.97,total:296.7,cagr:19.3,mdd:-21.0,h:71.5,r:131.3,year:[5.3,19.0,31.2,-0.7,5.1,8.4,55.7,37.0]},
 {label:'평가자산 25%',final:5.24,total:423.6,cagr:23.6,mdd:-30.0,h:83.2,r:185.8,year:[4.7,27.3,33.9,-3.2,6.1,10.4,72.9,49.8]},
 {label:'15% + KOSPI200 ETF',final:6.46,total:546.2,cagr:26.9,mdd:-40.9,h:98.6,r:225.3,year:[19.1,33.9,17.2,-16.9,28.0,-4.0,131.7,46.2]},
 {label:'20% + KOSPI200 ETF',final:7.87,total:687.2,cagr:30.2,mdd:-40.9,h:127.6,r:245.8,year:[20.4,34.7,30.2,-16.4,28.8,-2.2,144.9,44.4]},
 {label:'25% + KOSPI200 ETF',final:9.91,total:890.6,cagr:34.1,mdd:-40.9,h:138.7,r:315.0,year:[19.7,40.1,28.5,-14.4,29.5,-0.5,158.5,61.4]}];
/** Price returns (no dividends). S&P500 and Nasdaq-100 converted to won with USD/KRW; KOSPI200 is the KODEX 200 ETF price. */
export const INDICES:{label:string;total:number;mdd:number;year:number[]}[]=[
 {label:'KOSPI',total:179.5,mdd:-40.0,year:[7.7,30.8,3.6,-24.9,18.7,-9.6,75.6,36.0]},
 {label:'KOSDAQ',total:6.2,mdd:-47.4,year:[-0.9,44.6,6.8,-34.3,27.6,-21.7,36.5,-21.7]},
 {label:'S&P500 (원화)',total:262.4,mdd:-30.4,year:[33.5,9.2,39.0,-14.7,26.0,41.6,14.0,3.0]},
 {label:'나스닥100 (원화)',total:437.5,mdd:-30.8,year:[42.9,38.7,38.7,-29.0,56.0,43.4,17.8,4.6]},
 {label:'KOSPI200 ETF',total:297.8,mdd:-41.9,year:[14.4,35.6,3.0,-24.1,24.9,-9.4,94.2,50.4]}];
const pct=(v:number)=>`${v>0?'+':v<0?'−':''}${Math.abs(v).toFixed(1)}%`;
const cls=(v:number)=>v>=0?'up':'down';
export default function HistoryValidation(){
 return <details className="history-validation"><summary><span className="history-validation-star" aria-hidden="true">★</span><strong>과거 8년 검증 (2019~2026)</strong><em className="history-validation-badge">가장 신뢰할 근거</em><span className="history-validation-lead">1억 원 · 평가자산 15%씩 → 2.77억 원 (+177%) · 최대 낙폭 −19.5% · 같은 기간 KOSPI +180% (−40.0%)</span></summary>
  <p className="history-validation-why">이 전략을 판단할 때 가장 믿을 만한 자료입니다. 규칙을 정할 때 쓰지 않은 2019~2023년을 포함해 8년 동안, 지금 화면과 같은 규칙으로 계산했습니다. 아래 짧은 기간 시뮬레이션보다 이 결과를 먼저 보세요.</p>
  <p>지금 화면의 규칙(신호 4가지 조건, 다음 날 시가 매수, +30% 익절 / −10% 손절, 연기금 순매도 이탈 매도, 최소 300만 원, 수수료·세금 반영)을 2019-01-02 ~ 2026-10-30에 그대로 돌렸습니다. 1억 원으로 시작해 매수할 때마다 전날 평가자산의 15·20·25%를 샀고, 쉬는 현금은 그대로 두거나 KOSPI200 ETF(KODEX 200)에 넣었습니다.</p>
  <div className="history-validation-scroll"><table className="history-validation-table wide">
   <caption>전략 결과 · 1억 원 시작</caption>
   <thead><tr><th scope="col">전략</th><th scope="col">최종</th><th scope="col">누적</th><th scope="col">연평균</th><th scope="col">최대 낙폭</th><th scope="col">2019~23</th><th scope="col">2024~26</th></tr></thead>
   <tbody>{STRATEGY.map(r=><tr key={r.label}><th scope="row">{r.label}</th><td>{r.final.toFixed(2)}억</td><td className={cls(r.total)}>{pct(r.total)}</td><td>{pct(r.cagr)}</td><td className="down">{pct(r.mdd)}</td><td className={cls(r.h)}>{pct(r.h)}</td><td className={cls(r.r)}>{pct(r.r)}</td></tr>)}</tbody>
  </table></div>
  <div className="history-validation-scroll"><table className="history-validation-table wide">
   <caption>연도별 수익률 · 전략과 지수 (2026은 10/30까지, 지수는 가격 기준·배당 제외)</caption>
   <thead><tr><th scope="col">연도</th>{STRATEGY.map(r=><th scope="col" key={r.label}>{r.label.replace('평가자산 ','').replace(' + KOSPI200 ETF','+ETF')}</th>)}{INDICES.map(x=><th scope="col" className="index" key={x.label}>{x.label.replace(' (원화)','')}</th>)}</tr></thead>
   <tbody>{YEARS.map((y,i)=><tr key={y}><th scope="row">{y}</th>{STRATEGY.map(r=><td key={r.label} className={cls(r.year[i])}>{pct(r.year[i])}</td>)}{INDICES.map(x=><td key={x.label} className={`index ${cls(x.year[i])}`}>{pct(x.year[i])}</td>)}</tr>)}
    <tr className="total"><th scope="row">누적</th>{STRATEGY.map(r=><td key={r.label} className={cls(r.total)}>{pct(r.total)}</td>)}{INDICES.map(x=><td key={x.label} className={`index ${cls(x.total)}`}>{pct(x.total)}</td>)}</tr>
    <tr className="total mdd"><th scope="row">최대 낙폭</th>{STRATEGY.map(r=><td key={r.label} className="down">{pct(r.mdd)}</td>)}{INDICES.map(x=><td key={x.label} className="index down">{pct(x.mdd)}</td>)}</tr></tbody>
  </table></div>
  <p className="history-validation-note">15%·20%·25%는 매수 비중, ‘+ETF’는 쉬는 현금을 KOSPI200 ETF에 둔 경우입니다. S&P500·나스닥100은 원화 환산(원/달러 +19.9%)이며 달러 기준으로는 +202.4%, +348.4%입니다.</p>
  <p><strong>읽는 법</strong> 매매법만(15%)으로는 KOSPI와 수익이 비슷하고 낙폭은 절반입니다. 비중을 20·25%로 올리면 수익이 커지지만 낙폭도 −21%, −30%로 커집니다. 쉬는 현금을 KOSPI200 ETF에 두면 수익이 크게 늘지만, 자금 대부분이 지수에 있어 낙폭이 지수 수준(−40.9%, 2026년 7월 급락)이 되고 2022년(−14~−17%) 같은 해가 생깁니다. 수익의 큰 부분은 2025~2026년 KOSPI200 급등(+94%, +50%)에서 나왔습니다.</p>
  <p><strong>점검에서 확인한 것</strong> 기존 계산(비용 전·15%·2.68억)은 지금 엔진에서 그대로 재현됩니다. 평가가 멈춘 날은 없고, 상장폐지·합병 2종목은 마지막 거래가로 정산했습니다. 시작 달을 2019년 1~12월로 바꿔도 15%는 연평균 13.4~14.7%로 안정적입니다. 2026년 KOSPI의 큰 등락(7/31 하루 +17.9% 등)은 실제 시장 기록과 일치합니다. 거래세를 연도별로 다르게(0.15~0.30%) 잡아도 연평균 차이는 ±0.3%p 안쪽입니다.</p>
  <p><strong>주의할 점</strong> ① 25%는 현금이 모자라 신호를 늦게 사는 경우가 많습니다(156건 중 20건, 최대 43거래일 뒤 매수). 신호 다음 날 산다는 규칙과 다르고, 이탈 매도를 끄면 연평균이 23.6%→14.7%로 크게 흔들려 운에 좌우됩니다. 15%는 늦은 매수가 4건(최대 9일)뿐입니다. ② 자산이 커지면 주문이 커집니다. 25%+ETF는 2026년 주문 중간값이 약 2억 원, 일부는 신호일 거래대금의 26%로 실제로는 그 가격에 다 사기 어렵습니다. ③ 2019~2023년(규칙을 정할 때 안 쓴 기간)은 15%가 5년 +44.9%(연 약 7.7%)로, 2024~2026년보다 훨씬 낮습니다. ④ ETF는 소수 단위로 사고팔았다고 계산했고 분배금은 반영하지 않았습니다.</p>
  <p><strong>2019~2023년 규칙 검증</strong> 3개월 무매수가 1·2개월보다 나음, 조건을 좁힐수록 좋아지는 방향은 같지만 차이가 작아짐(거래당 +7.8% → +3.3%), +30%/−10%는 그 기간엔 더 넓은 폭이 나았음, 연기금 순매도 이탈 매도는 거래당 +0.3%p로 영향이 작음, 외국인 최대 순매도일 제외·음봉 우선·KOSPI 200일선 규칙은 근거 없음. 94개월 중 26개월은 신호가 없었습니다.</p>
  <p>수수료 0.015%·증권거래세 0.20%(2026년 세율)를 모든 연도에 같게 적용했습니다. 사후 계산이며 수익을 보장하지 않고 투자 권유가 아닙니다.</p>
 </details>;
}
