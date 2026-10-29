/** Explicit reconciliation transition; default account calls supply no actions. */
import {priceProblem,type Price} from './simulation-engine.ts';
export type SplitAction={id:string;known_on:string;halt_start:string;resume_date:string;numerator:number;denominator:number;fraction_policy?:'zero'};
export type SplitPosition={entry_date:string;entry_price:number;invested:number;shares:number;basis_price:number;phase:'active'|'halted'|'unresolved';last_close:number;last_day?:string;pending_action?:string|null;applied_actions?:string[];diagnosis?:string|null;cash_delta?:number;fractional_claim?:{numerator:number;denominator:number};fractional_forfeit?:{asset:string;fraction:string}[]};
export function splitDay(position:SplitPosition,action:SplitAction,day:string,quote:Price|null):SplitPosition{
 const p={...position,applied_actions:[...(position.applied_actions??[])]};
 if(p.last_day===day)return p;
 if(p.last_day&&day<p.last_day)throw Error('Out of order position day');
 if(day<p.entry_date||p.phase==='unresolved')return p;
 if(!Number.isSafeInteger(p.shares)||p.shares<=0)throw Error('Invalid position shares');
 p.last_day=day;
 const unresolved=(reason:string):SplitPosition=>({...p,phase:'unresolved',diagnosis:reason,cash_delta:0});
 const eligible=p.entry_date<action.halt_start&&action.known_on<=day;
 if(eligible&&action.halt_start<=day&&day<action.resume_date)return {...p,phase:'halted',pending_action:action.id,cash_delta:0,diagnosis:'확인된 거래정지'};
 if(p.phase==='halted'){
  if(!eligible||p.pending_action!==action.id||day!==action.resume_date)return unresolved('재개일 또는 기업행사 일치 확인 필요');
  const n=action.numerator,d=action.denominator,product=p.shares*n;
  if(!Number.isSafeInteger(n)||!Number.isSafeInteger(d)||n<=0||d<=0||!Number.isSafeInteger(product))throw Error('Invalid split ratio');
  const remainder=product%d;
  if(remainder&&action.fraction_policy!=='zero'){p.fractional_claim={numerator:remainder,denominator:d};return unresolved('단주 권리 현금 정산 필요');}
  if(remainder){const g=(a:number,b:number):number=>b===0?a:g(b,a%b),k=g(remainder,d);p.fractional_forfeit=[...(p.fractional_forfeit??[]),{asset:'분할 후 주식',fraction:`${remainder/k}/${d/k}`}];}
  const problem=priceProblem({open:null,high:null,low:null,close:p.last_close*d/n},quote);
  if(problem)return unresolved('재개일 '+problem);
  if(product-remainder===0)return unresolved('분할 후 정수 주식 없음');
  p.shares=(product-remainder)/d;p.basis_price=p.invested/p.shares;p.phase='active';p.pending_action=null;p.diagnosis=null;p.cash_delta=0;p.applied_actions!.push(action.id);
 }else{
  const problem=priceProblem({open:null,high:null,low:null,close:p.last_close},quote);
  if(problem)return unresolved(problem);
 }
 p.last_close=quote!.close!;return p;
}
