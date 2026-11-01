/** 8항목 점수 3년 재구성 검증 요약 (비공개 연구 rank8-2026-10-30, 2026-10-31 산출). 사후 계산 집계값만 담는다. */
export const RANK8_BANDS:[string,number,number,number][]=[['1~20위',1.5,3.5,2.6],['21~100위',0.7,1.4,0.9],['101~300위',0.1,0.6,1.6],['301위 이하',-0.1,-0.3,-0.4]];
const pct=(v:number)=>`${v>0?'+':v<0?'−':''}${Math.abs(v).toFixed(1)}%p`;
export default function Rank8Research(){
 return <details className="rank-method rank-research"><summary>과거 3년 검증 결과<span>상위 20위 묶음만 시장보다 우위</span></summary>
  <p>같은 계산식으로 2024년 1월부터 매일 점수를 다시 만들어, 다음 날 시가에 사서 20거래일 보유했을 때 같은 날 살 수 있던 전체 종목 평균보다 얼마나 더 올랐는지 비교했습니다. 판정 기준은 결과를 보기 전에 정했습니다.</p>
  <table className="rank-research-table"><caption>순위 구간별 20거래일 시장 대비 초과수익</caption><thead><tr><th scope="col">순위 구간</th><th scope="col">2024</th><th scope="col">2025</th><th scope="col">2026</th></tr></thead>
   <tbody>{RANK8_BANDS.map(([band,...values])=><tr key={band}><th scope="row">{band}</th>{values.map((v,i)=><td key={i} className={v>0?'up':v<0?'down':''}>{pct(v)}</td>)}</tr>)}</tbody></table>
  <p><strong>통과</strong> 1~20위를 한 묶음으로 보유하는 방식만 사전 기준을 넘었습니다. 1~20위가 매년 가장 높았고 301위 이하는 매년 마이너스였습니다.</p>
  <p><strong>주의</strong> 종목 하나씩 보면 시장보다 더 오른 비율은 47~50%로 반반이고, 평균은 소수 급등 종목이 끌어올렸습니다. 대형주 비중이 커서 비슷한 크기 종목끼리 비교하면 +0.6/+2.3/+1.3%p로 줄고, 2024년은 우연과 구분되지 않습니다. 한두 종목을 고르는 근거보다 관심 종목 풀로 쓰는 편이 맞습니다.</p>
  <p><strong>근거 없음</strong> 70점 이상 같은 점수 구간, 상위 20 신규 진입, 연기금·외국인 동반 매집과의 조합, 동반 매집 종목을 이 점수 순으로 고르기는 기준을 통과하지 못했습니다.</p>
  <p>2026-10-30까지 자료의 사후 계산이며, 2026년 구간은 최종 확인용으로 한 번만 계산했습니다. 수익을 보장하지 않으며 투자 권유가 아닙니다.</p>
 </details>;
}
