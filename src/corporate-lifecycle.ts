/**
 * Bonus-issue and spinoff account lifecycle for explicit, evidence-gated reconciliation.
 * Mirrors collector/corporate_lifecycle.py field for field. Fractional entitlements follow the
 * context's explicit fraction_policy:'zero' (valued at 0 won, never credited as cash).
 */
import {priceProblem,type Price} from './simulation-engine.ts';
export type BonusAction={id:string;kind:'bonus';known_on:string;ex_date:string;listing_date:string;numerator:number;denominator:number;fraction_policy?:'zero'};
export type SpinoffAction={id:string;kind:'spinoff';known_on:string;halt_start:string;resume_date:string;numerator:number;denominator:number;new_code:string;new_name:string;new_numerator:number;new_denominator:number;fraction_policy?:'zero'};
export type Forfeit={asset:string;fraction:string};
export type Leg={name:string;code:string;shares:number;price:number|null};
export type CorporatePosition={entry_date:string;entry_price:number;invested:number;shares:number;basis_price:number;
 phase:'active'|'halted'|'joint'|'locked_exit'|'closed'|'unresolved';last_close:number;last_day?:string;applied_actions:string[];
 locked:number;sold:number;realized:number;new_shares:number;new_last_close:number|null;
 exit_status:'take'|'stop'|null;exit_reason:string|null;exit_price:number|null;decision_day:string|null;
 fractional_forfeit:Forfeit[];diagnosis?:string|null};
export type CorporateStep={position:CorporatePosition;status:'open'|'unresolved'|'take'|'stop';reason:string;pnl:number|null;return_pct:number|null;
 exit_price:number|null;held_value:number|null;cash_in:number;reference_value:number|null;ambiguous:boolean;shares:number;legs:Leg[]};
const MAX=9007199254740991;
const gcd=(a:number,b:number):number=>b===0?a:gcd(b,a%b);
const round4=(v:number)=>Math.round(v*1e4)/1e4;
export function initialCorporatePosition(t:{entry_date:string;entry_price:number;invested:number;shares:number},previousClose:number|null|undefined):CorporatePosition{
 return {entry_date:t.entry_date,entry_price:t.entry_price,invested:t.invested,shares:t.shares,basis_price:t.entry_price,phase:'active',
  last_close:previousClose??t.entry_price,applied_actions:[],locked:0,sold:0,realized:0,new_shares:0,new_last_close:null,
  exit_status:null,exit_reason:null,exit_price:null,decision_day:null,fractional_forfeit:[],diagnosis:null};
}
function entitle(shares:number,n:number,d:number,asset:string,forfeit:Forfeit[]){
 if(![n,d].every(v=>Number.isSafeInteger(v)&&v>0&&v<=MAX))throw Error('Invalid corporate ratio');
 const product=shares*n;if(!Number.isSafeInteger(product))throw Error('Invalid corporate ratio');
 const remainder=product%d;
 if(remainder){const g=gcd(remainder,d);forfeit.push({asset,fraction:`${remainder/g}/${d/g}`});}
 return (product-remainder)/d;
}
/** Conservative daily barrier on an adjusted per-share basis; identical rule to the plain engine. */
export function barrier(quote:Price,basis:number,take:number,stop:number){
 const upper=basis*(1+take/100),lower=basis*(1-stop/100);
 let price=quote.close!,status:'open'|'take'|'stop'='open',reason='최신 종가 평가',ambiguous=false;
 if(quote.open!<=lower){price=quote.open!;status='stop';reason='손절선 아래 갭 시가 청산';}
 else if(quote.open!>=upper){price=quote.open!;status='take';reason='익절선 위 갭 시가 청산';}
 else if(quote.high!>=upper&&quote.low!<=lower){ambiguous=true;price=lower;status='stop';reason='같은 날 양쪽 도달 · 손절 우선';}
 else if(quote.low!<=lower){price=lower;status='stop';reason='장중 손절선 도달';}
 else if(quote.high!>=upper){price=upper;status='take';reason='장중 익절선 도달';}
 return {price,status,reason,ambiguous};
}
export function corporateStep(position:CorporatePosition,action:BonusAction|SpinoffAction,day:string,quote:Price|null,assetQuote:Price|null,take=30,stop=10):CorporateStep{
 if(!Number.isFinite(take)||!Number.isFinite(stop)||take<1||take>100||stop<1||stop>50)throw Error('Invalid barriers');
 if(position.last_day&&day<=position.last_day)throw Error('Out of order position day');
 if(day<position.entry_date)throw Error('Position day before entry');
 if(!Number.isSafeInteger(position.shares)||position.shares<0)throw Error('Invalid position shares');
 if(action.fraction_policy!=null&&action.fraction_policy!=='zero')throw Error('Invalid fraction policy');
 const p:CorporatePosition={...position,applied_actions:[...position.applied_actions],fractional_forfeit:[...position.fractional_forfeit],last_day:day};
 const legs=():Leg[]=>action.kind==='spinoff'&&p.applied_actions.includes(action.id)?[{name:'존속 주식',code:'',shares:p.shares,price:quote?.close??null},{name:action.new_name,code:action.new_code,shares:p.new_shares,price:assetQuote?.close??null}]:[];
 const out=(o:Partial<CorporateStep>&{status:CorporateStep['status'];reason:string}):CorporateStep=>({position:p,pnl:null,return_pct:null,exit_price:null,held_value:null,cash_in:0,reference_value:null,ambiguous:false,shares:p.shares+p.locked+p.sold,legs:legs(),...o});
 const valued=(value:number,o:Partial<CorporateStep>&{status:CorporateStep['status'];reason:string})=>{const pnl=round4(p.realized+value-p.invested);return out({pnl,return_pct:(p.realized+value)/p.invested*100-100,...o});};
 const unresolved=(reason:string)=>{p.phase='unresolved';p.diagnosis=reason;return out({status:'unresolved',reason});};
 if(position.phase==='unresolved')return out({status:'unresolved',reason:position.diagnosis??'기업행사 정산 확인 필요'});
 if(position.phase==='closed')throw Error('Closed corporate position');
 const ratioCheck=(n:number,d:number)=>{if(![n,d].every(v=>Number.isSafeInteger(v)&&v>0))throw Error('Invalid corporate ratio');};
 if(action.kind==='bonus'){
  ratioCheck(action.numerator,action.denominator);
  const eligible=p.entry_date<action.ex_date&&action.known_on<=day;
  if(p.phase==='locked_exit'){
   const problem=priceProblem({open:null,high:null,low:null,close:p.last_close},quote);if(problem)return unresolved(problem);
   p.last_close=quote!.close!;
   if(day>=action.listing_date){
    const proceeds=p.locked*quote!.open!;p.realized+=proceeds;p.sold+=p.locked;const locked=p.locked;p.locked=0;p.phase='closed';
    return out({status:p.exit_status!,reason:`${p.exit_reason} · 무상신주 ${locked}주 ${day} 상장일 시가 매도`,pnl:round4(p.realized-p.invested),return_pct:p.realized/p.invested*100-100,exit_price:p.exit_price,cash_in:proceeds,shares:p.sold});
   }
   return valued(p.locked*quote!.close!,{status:'open',reason:`${p.exit_reason} · 무상신주 ${p.locked}주 ${action.listing_date} 상장일 시가 매도 대기`,exit_price:quote!.close!,held_value:p.locked*quote!.close!});
  }
  if(eligible&&day>=action.ex_date&&!p.applied_actions.includes(action.id)){
   if(day!==action.ex_date)return unresolved('권리락일 시세 확인 필요');
   if(p.shares<=0)throw Error('Invalid position shares');
   const locked=entitle(p.shares,action.numerator,action.denominator,'무상배정 신주',p.fractional_forfeit);
   const reference=p.last_close*action.denominator/(action.denominator+action.numerator);
   const problem=priceProblem({open:null,high:null,low:null,close:reference},quote);if(problem)return unresolved('권리락일 '+problem);
   p.locked=locked;p.basis_price=p.invested/(p.shares+locked);p.applied_actions.push(action.id);
  }else{
   const problem=priceProblem({open:null,high:null,low:null,close:p.last_close},quote);if(problem)return unresolved(problem);
  }
  if(p.locked>0&&day>=action.listing_date){p.shares+=p.locked;p.locked=0;}
  const total=p.shares+p.locked,b=barrier(quote!,p.basis_price,take,stop);p.last_close=quote!.close!;
  if(b.status==='open')return valued(total*quote!.close!,{status:'open',reason:b.reason,exit_price:quote!.close!,held_value:total*quote!.close!});
  const proceeds=p.shares*b.price;p.realized+=proceeds;p.sold+=p.shares;p.shares=0;
  if(p.locked===0){p.phase='closed';return out({status:b.status,reason:b.reason,pnl:round4(p.realized-p.invested),return_pct:p.realized/p.invested*100-100,exit_price:b.price,cash_in:proceeds,ambiguous:b.ambiguous,shares:p.sold});}
  p.phase='locked_exit';p.exit_status=b.status;p.exit_reason=b.reason;p.exit_price=b.price;p.decision_day=day;
  return valued(p.locked*quote!.close!,{status:'open',reason:`${b.reason} · 무상신주 ${p.locked}주 ${action.listing_date} 상장일 시가 매도 대기`,exit_price:quote!.close!,held_value:p.locked*quote!.close!,cash_in:proceeds,ambiguous:b.ambiguous});
 }
 // Spinoff: one original position becomes retained + new shares, judged jointly at the close.
 ratioCheck(action.numerator,action.denominator);ratioCheck(action.new_numerator,action.new_denominator);
 const eligible=p.entry_date<action.halt_start&&action.known_on<=day;
 if(p.phase==='active'&&!p.applied_actions.includes(action.id)){
  if(eligible&&action.halt_start<=day&&day<action.resume_date){p.phase='halted';p.diagnosis='확인된 거래정지';return out({status:'open',reason:'확인된 거래정지 · 회사분할 재상장 대기',reference_value:p.shares*p.last_close});}
  const problem=priceProblem({open:null,high:null,low:null,close:p.last_close},quote);if(problem)return unresolved(problem);
  const b=barrier(quote!,p.basis_price,take,stop);p.last_close=quote!.close!;
  if(b.status==='open')return valued(p.shares*quote!.close!,{status:'open',reason:b.reason,exit_price:quote!.close!,held_value:p.shares*quote!.close!});
  const proceeds=p.shares*b.price;p.realized+=proceeds;p.sold=p.shares;p.shares=0;p.phase='closed';
  return out({status:b.status,reason:b.reason,pnl:round4(p.realized-p.invested),return_pct:p.realized/p.invested*100-100,exit_price:b.price,cash_in:proceeds,ambiguous:b.ambiguous,shares:p.sold});
 }
 if(p.phase==='halted'){
  if(eligible&&day<action.resume_date)return out({status:'open',reason:'확인된 거래정지 · 회사분할 재상장 대기',reference_value:p.shares*p.last_close});
  if(!eligible||day!==action.resume_date)return unresolved('재개일 또는 기업행사 일치 확인 필요');
  const retained=entitle(p.shares,action.numerator,action.denominator,'존속 주식',p.fractional_forfeit);
  const fresh=entitle(p.shares,action.new_numerator,action.new_denominator,action.new_name,p.fractional_forfeit);
  const problem=priceProblem(null,quote);if(problem)return unresolved('재개일 '+problem);
  const assetProblem=priceProblem(null,assetQuote);if(assetProblem)return unresolved('재개일 신설 종목 '+assetProblem);
  p.shares=retained;p.new_shares=fresh;p.basis_price=p.invested/(retained+fresh);p.phase='joint';p.diagnosis=null;p.applied_actions.push(action.id);
 }else if(p.phase==='joint'){
  const problem=priceProblem({open:null,high:null,low:null,close:p.last_close},quote);if(problem)return unresolved(problem);
  const assetProblem=priceProblem({open:null,high:null,low:null,close:p.new_last_close},assetQuote);if(assetProblem)return unresolved('신설 종목 '+assetProblem);
  if(p.exit_status){
   const proceeds=p.shares*quote!.open!+p.new_shares*assetQuote!.open!;p.realized+=proceeds;p.last_close=quote!.close!;p.new_last_close=assetQuote!.close!;
   const result=out({status:p.exit_status!,reason:`${p.exit_reason} · ${day} 시가 두 종목 매도`,pnl:round4(p.realized-p.invested),return_pct:p.realized/p.invested*100-100,exit_price:quote!.open!,cash_in:proceeds,legs:[{name:'존속 주식',code:'',shares:p.shares,price:quote!.open!},{name:action.new_name,code:action.new_code,shares:p.new_shares,price:assetQuote!.open!}]});
   p.phase='closed';return result;
  }
 }else throw Error('Invalid corporate phase');
 p.last_close=quote!.close!;p.new_last_close=assetQuote!.close!;
 const value=p.shares*quote!.close!+p.new_shares*assetQuote!.close!;
 let reason='두 종목 합산 종가 평가';
 if(value>=p.invested*(1+take/100)){p.exit_status='take';p.exit_reason=`${day} 합산 종가 익절선 도달`;}
 else if(value<=p.invested*(1-stop/100)){p.exit_status='stop';p.exit_reason=`${day} 합산 종가 손절선 도달`;}
 if(p.exit_status){p.decision_day=day;reason=`${p.exit_reason} · 다음 거래일 시가 매도 예정`;}
 return valued(value,{status:'open',reason,exit_price:quote!.close!,held_value:value});
}
