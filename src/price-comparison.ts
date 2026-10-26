import {priceProblem,type Price} from './simulation-engine.ts';
export type PriceComparison={status:'comparable'|'blocked'|'pending';date:string|null;reason:string|null};
export function priceComparison(prices:(Partial<Price>|null)[],sessions:string[],signalDate:string):PriceComparison{
 const start=sessions.indexOf(signalDate),close=prices[start]?.close;
 if(start<0||close==null||!Number.isFinite(close)||close<=0)return {status:'blocked',date:signalDate,reason:'신호일 종가 미확인'};
 const normalize=(r:Partial<Price>|null|undefined):Price|null=>r?{open:r.open??null,high:r.high??null,low:r.low??null,close:r.close??null,volume:r.volume,change_pct:r.change_pct}:null;
 for(let i=start+1;i<sessions.length;i++){const reason=priceProblem(normalize(prices[i-1]),normalize(prices[i]));if(reason)return {status:'blocked',date:sessions[i],reason};}
 return {status:'comparable',date:null,reason:null};
}
