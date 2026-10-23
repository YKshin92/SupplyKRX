import {buyScore} from './buy-score';
import {amountLabel,sign} from './data';
import {percentLabel} from './price-change';
import type {TrackingEvent} from './tracking';

export default function TrackingScoreDetails({event,lookback}:{event:TrackingEvent;lookback:number}){
 const score=buyScore(event),prior=event.prior[String(lookback)];
 return <section className="tracking-score-details" aria-label="등록 사례 점수 근거">
  <div className="score-detail-heading"><div><h3>매수 관심 스코어</h3><p>신호 {event.signal_date} · 최초 등록 {event.first_registration_date??event.signal_date} · 이전 {lookback}거래일 관찰</p></div><strong>{score.total===null?'자료 부족':`${score.total} / 100`}</strong></div>
  <div className="score-breakdown">{score.parts.map(part=><div key={part.label}><span>{part.label}</span><strong>{part.value===null?'미수집':part.value.toFixed(1)} <small>/ {part.max}</small></strong></div>)}</div>
  <dl className="score-inputs"><div><dt>등록일 연기금 매수</dt><dd>{amountLabel(event.signal_buy??null)}</dd></div><div><dt>등록일 외국인 매수 / 순매수</dt><dd>{amountLabel(event.foreign_buy??null)} / {amountLabel(event.foreign_net??null)}</dd></div><div><dt>연기금 순매수 / 시총</dt><dd>{score.ratio===null?'미수집':`${(score.ratio*100).toFixed(4)}%`}</dd></div><div><dt>최신 시총 기준일</dt><dd>{event.metadata_date??'미수집'}</dd></div></dl>
  <p>초기 가설에 따른 비교 점수 · 최신 시총 사용으로 등록 당시 점수와 다름 · 거래 공백은 등록 조건으로만 적용</p>
  {!!prior?.absent_days&&<p>이전 {lookback}거래일 중 정상 응답 미포함 0 처리 {prior.absent_days}일</p>}
  <div className="tracking-outcome-detail"><h3>등록 사례 5거래일 성과</h3>{event.outcome_status==='complete'?<><div className="score-breakdown"><div><span>다음 날 시가 → 5일째 종가</span><strong className={sign(event.return_5d??null)}>{percentLabel(event.return_5d??null)}</strong></div><div><span>진입가 대비 최대 하락</span><strong className={sign(event.downside_5d??null)}>{percentLabel(event.downside_5d??null)}</strong></div></div><p>{event.outcome_entry_date} 시가 → {event.outcome_end_date} 종가 · 등록일 종가 대비 5일 내 최고가 {percentLabel(event.peak_5d??null)} (사후 도달치)</p></>:<span className="outcome-badge">{event.outcome_status==='pending'?'5거래일 경과 대기':event.outcome_status==='price_break'?'가격 불연속 확인 필요':'가격 자료 부족'}</span>}<p>비용·배당·기업행사 보정 미반영 · 이후 성과는 점수에 사용하지 않음</p></div>
 </section>;
}

