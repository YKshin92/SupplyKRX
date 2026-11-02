/** 과거 8년(2019~2026) 연기금 매매법 검증 요약 (비공개 연구 history-validation-2026-11-01, 2026-11-02 산출). 사후 계산 집계값만 담는다. */
export const YEARLY:[string,number,number][]=[['2019',4.5,4.0],['2020',14.8,13.9],['2021',15.9,14.5],['2022',-3.3,-3.8],['2023',6.4,6.0],['2024',2.2,1.8],['2025',44.2,43.1],['2026',27.3,26.2]];
const pct=(v:number)=>`${v>0?'+':v<0?'−':''}${Math.abs(v).toFixed(1)}%`;
export default function HistoryValidation(){
 return <details className="history-validation"><summary><strong>과거 8년 검증 (2019~2026)</strong><span>1억 원 · 평가자산 15%씩 → 2.68억 원 (+168%)</span></summary>
  <p>지금 매매법(신호 4가지 조건, 다음 날 시가 매수, +30% 익절 / −10% 손절)을 2019년 1월부터 그대로 돌렸습니다. 1억 원으로 시작해 매수할 때마다 전날 평가자산의 15%를 샀다고 가정했습니다. 최대 낙폭은 −19.4%(2021년)입니다.</p>
  <table className="history-validation-table"><caption>연도별 수익률</caption><thead><tr><th scope="col">연도</th><th scope="col">비용 전</th><th scope="col">수수료·세금 반영</th></tr></thead>
   <tbody>{YEARLY.map(([y,a,b])=><tr key={y}><th scope="row">{y==='2026'?'2026 (~10/30)':y}</th><td className={a>=0?'up':'down'}>{pct(a)}</td><td className={b>=0?'up':'down'}>{pct(b)}</td></tr>)}
    <tr className="total"><th scope="row">누적</th><td className="up">+168.3%</td><td className="up">+154.3%</td></tr></tbody></table>
  <p><strong>기대치</strong> 규칙을 정할 때 쓰지 않은 2019~2023년만 보면 연평균 약 7%였고, 수익의 대부분은 2025~2026년에 났습니다. 2022·2024년처럼 손실이나 제자리인 해도 있고, 94개월 중 26개월은 신호가 없었습니다.</p>
  <p><strong>2019~2023년에도 유지된 것</strong> 3개월 무매수가 1·2개월보다 나음, 종목당 15%(300만/2천만) 수준이 낙폭 대비 적정, 서둘러 팔거나 연기금 순매도로 파는 규칙은 개선 없음.</p>
  <p><strong>달라진 것</strong> 조건을 좁힐수록 좋아지는 방향은 같았지만 차이가 작아졌고(현재 조건 거래당 +7.8% → +3.3%), +30%/−10%는 그 기간엔 더 넓은 폭이 나았습니다. 외국인 최대 순매도일 제외와 음봉 우선은 근거가 없었습니다.</p>
  <p>보유 중 가격이 끊긴 2종목(상장폐지·합병)은 마지막 거래가로 정산했습니다. 수수료 0.015%·증권거래세 0.20%(2026년 세율)를 모든 연도에 같게 적용했습니다. 사후 계산이며 수익을 보장하지 않고 투자 권유가 아닙니다.</p>
 </details>;
}
