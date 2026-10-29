import type {SimTrade} from './simulation-engine.ts';
export type TradeContext=Pick<SimTrade,'entry_date'|'entry_price'|'exit_date'|'exit_price'|'status'|'return_pct'>&Partial<Pick<SimTrade,'reason'|'shares'|'adjusted_basis'|'corporate_phase'|'corporate_evidence_on'|'corporate_reference_value'|'fractional_claim'|'fractional_forfeit'|'corporate_legs'>>;
export const adjustedBasis=(t:TradeContext)=>t.adjusted_basis!=null&&t.entry_price!=null&&Math.abs(t.adjusted_basis-t.entry_price)>1e-6?t.adjusted_basis:null;
const fraction=(value:string)=>{const [n,d]=value.split('/').map(Number);return Number.isFinite(n)&&Number.isFinite(d)&&d>0?String(+(n/d).toFixed(7)):value;};
export function corporateNotes(t:TradeContext){
 const notes:string[]=[];
 const joint=(t.corporate_legs?.length??0)>1;
 if(adjustedBasis(t)!=null)notes.push(joint?'회사분할 후 두 종목 수량으로 손익을 계산합니다. 일봉은 원주가이며 행사 전후 가격 단위가 다릅니다.':'기업행사 후 수량과 평단으로 손익을 계산합니다. 일봉은 원주가이며 행사 전후 가격 단위가 다릅니다.');
 if(joint)notes.push('두 종목 평가액 합계를 원래 매수금액과 비교해 종가로 익절·손절을 판정하고, 다음 거래일 시가에 두 종목을 함께 매도합니다. 장중 동시 도달은 알 수 없어 사용하지 않습니다.');
 if(t.corporate_phase==='locked_exit'||t.reason?.includes('무상신주'))notes.push('무상신주는 상장일 전에는 매도할 수 없어, 기존 주식 청산 뒤 남은 신주는 상장일 시가에 매도합니다.');
 if(t.corporate_phase==='halted')notes.push('확인된 거래정지: 보유를 유지하며 매매하지 않습니다. 참고평가는 확정 자산·손익에 포함하지 않습니다.');
 if(t.fractional_claim)notes.push(`단주 ${t.fractional_claim.numerator}/${t.fractional_claim.denominator}주 권리: 지급일·금액 미확인으로 현금에 반영하지 않았습니다.`);
 if(t.fractional_forfeit?.length)notes.push(`단주 ${t.fractional_forfeit.map(f=>`${f.asset} ${fraction(f.fraction)}주`).join(', ')}: 지급일 미확인으로 정산 정책상 0원 처리(보수적)했으며 현금에 반영하지 않았습니다.`);
 if(t.corporate_evidence_on&&adjustedBasis(t)!=null)notes.push(`기업행사 사후 정산 근거 ${t.corporate_evidence_on} · 신호일 매수 점수에 사용하지 않음`);
 return notes;
}
