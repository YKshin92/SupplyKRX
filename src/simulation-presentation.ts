import type {SimTrade} from './simulation-engine.ts';
export type TradeContext=Pick<SimTrade,'entry_date'|'entry_price'|'exit_date'|'exit_price'|'status'|'return_pct'>&Partial<Pick<SimTrade,'reason'|'shares'|'adjusted_basis'|'corporate_phase'|'corporate_evidence_on'|'corporate_reference_value'|'fractional_claim'>>;
export const adjustedBasis=(t:TradeContext)=>t.adjusted_basis!=null&&t.entry_price!=null&&Math.abs(t.adjusted_basis-t.entry_price)>1e-6?t.adjusted_basis:null;
export function corporateNotes(t:TradeContext){
 const notes:string[]=[];
 if(adjustedBasis(t)!=null)notes.push('분할 후 수량과 평단으로 손익을 계산합니다. 일봉은 원주가이며 분할 전후 가격 단위가 다릅니다.');
 if(t.corporate_phase==='halted')notes.push('확인된 거래정지: 보유를 유지하며 매매하지 않습니다. 참고평가는 확정 자산·손익에 포함하지 않습니다.');
 if(t.fractional_claim)notes.push(`단주 ${t.fractional_claim.numerator}/${t.fractional_claim.denominator}주 권리: 지급일·금액 미확인으로 현금에 반영하지 않았습니다.`);
 if(t.corporate_evidence_on&&adjustedBasis(t)!=null)notes.push(`기업행사 사후 정산 근거 ${t.corporate_evidence_on} · 신호일 매수 점수에 사용하지 않음`);
 return notes;
}
