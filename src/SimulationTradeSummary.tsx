import {integer} from './data';
import {percentLabel} from './price-change';
import {adjustedBasis,corporateNotes,type TradeContext} from './simulation-presentation';
export default function SimulationTradeSummary({trade}:{trade:TradeContext}){
 const basis=adjustedBasis(trade),notes=corporateNotes(trade);
 return <section className="notice simulation-trade-context" aria-label="모의 매매 가격 기준">
  <strong>모의 매매 · {percentLabel(trade.return_pct)}</strong>
  <dl><div><dt>실제 매수</dt><dd>{trade.entry_date??'미매수'} · {integer(trade.entry_price)}원</dd></div>
   {basis!=null&&<div><dt>행사 후 평단 · 수량</dt><dd>{integer(basis)}원 · {integer(trade.shares??null)}주</dd></div>}
   {(trade.corporate_legs?.length??0)>1&&<div><dt>분할 후 보유</dt><dd>{trade.corporate_legs!.map(l=>`${l.name} ${integer(l.shares)}주${l.price!=null?` @ ${integer(l.price)}원`:''}`).join(' + ')}</dd></div>}
   <div><dt>청산·평가</dt><dd>{trade.exit_date??'—'} · {integer(trade.exit_price)}원</dd></div>
   {trade.corporate_reference_value!=null&&<div><dt>정지 중 참고평가</dt><dd>{integer(trade.corporate_reference_value)}원 · 확정 평가 아님</dd></div>}
  </dl>{notes.map(note=><p key={note}>{note}</p>)}
 </section>;
}
