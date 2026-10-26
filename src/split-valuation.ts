/** Staged valuation only. Sale proceeds are proposed, never credited to cash here. */
import {priceProblem,type Price} from './simulation-engine.ts';
import type {SplitPosition} from './split-lifecycle.ts';
export type SplitValue={status:string;pnl:number|null;return_pct:number|null;exit_price:number|null;confirmed_value:number|null;reference_value:number|null;sale_proceeds:number;ambiguous:boolean;reason?:string};
export function splitValue(position:SplitPosition,quote:Price|null,take=30,stop=10):SplitValue{
 if(!Number.isFinite(take)||!Number.isFinite(stop)||take<1||take>100||stop<1||stop>50)throw Error('Invalid barriers');
 const result:SplitValue={status:position.phase,pnl:null,return_pct:null,exit_price:null,confirmed_value:null,reference_value:null,sale_proceeds:0,ambiguous:false};
 if(position.phase==='unresolved')return result;
 if(position.phase==='halted')return {...result,reference_value:position.shares*position.last_close};
 const problem=priceProblem(null,quote);if(problem)return {...result,status:'unresolved',reason:problem};
 const {shares,invested}=position;
 if(!Number.isSafeInteger(shares)||shares<=0||!Number.isFinite(invested)||invested<=0)throw Error('Invalid position cost');
 const basis=invested/shares,upper=basis*(1+take/100),lower=basis*(1-stop/100);
 let price=quote!.close!,status='open',reason='최신 종가 평가';
 if(quote!.open!<=lower){price=quote!.open!;status='stop';reason='손절선 아래 갭 시가 청산';}
 else if(quote!.open!>=upper){price=quote!.open!;status='take';reason='익절선 위 갭 시가 청산';}
 else if(quote!.high!>=upper&&quote!.low!<=lower){result.ambiguous=true;price=lower;status='stop';reason='같은 날 양쪽 도달 · 손절 우선';}
 else if(quote!.low!<=lower){price=lower;status='stop';reason='장중 손절선 도달';}
 else if(quote!.high!>=upper){price=upper;status='take';reason='장중 익절선 도달';}
 const value=shares*price;
 return {...result,status,reason,pnl:Math.round((value-invested)*1e4)/1e4,return_pct:(value/invested-1)*100,exit_price:status==='open'?null:price,confirmed_value:value,sale_proceeds:status==='open'?0:value};
}
