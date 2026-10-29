import type {CorporateContext} from './corporate-context';
import type {SimTrade} from './simulation-engine';
import {adjustedBasis} from './simulation-presentation';
import {recentSelectors} from './release-notes';
const kindLabel={split:'액면분할',bonus:'무상증자',spinoff:'인적분할'} as const;
/** Lists every audited corporate action applied to this run, with dates, evidence and policy. */
export default function CorporateReconciliation({context,trades}:{context:CorporateContext;trades:SimTrade[]}){
 const affected=trades.filter(t=>t.invested>0&&(adjustedBasis(t)!=null||(t.corporate_legs?.length??0)>1||(t.fractional_forfeit?.length??0)>0)).length;
 const name=(code:string)=>trades.find(t=>t.code===code)?.name??code;
 return <details className="corporate-rights corporate-reconciliation">
  <summary>기업행사 사후 정산 {context.actions.length}건 적용 · 이번 계산 영향 {affected}건 · 확인 기준 {context.as_of}{recentSelectors().has('.corporate-reconciliation')&&<span className="new-badge">NEW</span>}</summary>
  <p>신호일 점수와 매수 판단에는 사용하지 않고, 이미 보유한 수량·평단·매도 시점만 정산합니다.</p>
  <dl>{context.actions.map(a=>{const kind=a.kind??'split';return <div key={a.id}><dt>{name(a.code)} · {kindLabel[kind]}</dt><dd>{a.kind==='bonus'?`권리락 ${a.ex_date} · 신주 상장 ${a.listing_date} · 1주당 ${a.numerator}/${a.denominator}주`:a.kind==='spinoff'?`거래정지 ${a.halt_start} → 재상장 ${a.resume_date} · 존속 ${a.numerator/a.denominator}주 + ${a.new_name} ${a.new_numerator/a.new_denominator}주`:`거래정지 ${a.halt_start} → 재개 ${a.resume_date} · 1주→${a.numerator/a.denominator}주`}{a.fraction_policy==='zero'?' · 단주 0원':''}<small>근거 {a.evidence_on} · <a href={a.source} target="_blank" rel="noopener noreferrer">공시 확인</a></small></dd></div>;})}</dl>
  <p className="corporate-rights-warning">단주 대금은 지급일이 공시되지 않아 0원으로 처리했습니다(실제보다 보수적). 무상신주는 상장일 전 매도하지 않고, 회사분할은 두 종목 합산 종가로 판정해 다음 거래일 시가에 매도합니다.</p>
 </details>;
}
