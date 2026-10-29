import type {SplitAction} from './split-lifecycle.ts';
import type {BonusAction,SpinoffAction} from './corporate-lifecycle.ts';
type Evidence={code:string;evidence_on:string;source:string};
export type CorporateAction=((SplitAction&{kind?:'split'})|BonusAction|SpinoffAction)&Evidence;
export type CorporateContext={as_of:string;policy?:string;actions:CorporateAction[]};
/** First session on which an action can affect a position held before it. */
export const actionStart=(a:CorporateAction)=>a.kind==='bonus'?a.ex_date:a.halt_start;
export function corporateActionMap(context:CorporateContext|undefined){
 const result=new Map<string,CorporateAction>();if(context===undefined)return result;
 const fail=():never=>{throw Error('Invalid corporate reconciliation context');};
 const validDay=(v:unknown):v is string=>typeof v==='string'&&/^(?!0000)[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 const ratio=(...v:unknown[])=>v.every(x=>Number.isSafeInteger(x)&&(x as number)>0);
 if(!context||!validDay(context.as_of)||!Array.isArray(context.actions))fail();
 if(context.policy!==undefined&&typeof context.policy!=='string')fail();
 const ids=new Set<string>();
 for(const a of context.actions){
  if(!a||typeof a.code!=='string'||!/^[0-9A-Z]{6}$/.test(a.code)||result.has(a.code)||typeof a.id!=='string'||!a.id.trim()||ids.has(a.id))fail();
  if(a.fraction_policy!==undefined&&a.fraction_policy!=='zero')fail();
  const kind=a.kind??'split';
  if(kind==='bonus'){
   const b=a as BonusAction&Evidence;
   if(![b.known_on,b.ex_date,b.listing_date,b.evidence_on].every(validDay)||!(b.known_on<=b.ex_date&&b.ex_date<b.listing_date&&b.known_on<=b.evidence_on&&b.evidence_on<=context.as_of))fail();
  }else if(kind==='split'||kind==='spinoff'){
   const s=a as SplitAction&Evidence;
   if(![s.known_on,s.halt_start,s.resume_date,s.evidence_on].every(validDay)||!(s.known_on<=s.halt_start&&s.halt_start<s.resume_date&&s.known_on<=s.evidence_on&&s.evidence_on<=context.as_of))fail();
   if(kind==='spinoff'){const x=a as SpinoffAction;if(typeof x.new_code!=='string'||!/^[0-9A-Z]{6}$/.test(x.new_code)||x.new_code===a.code||typeof x.new_name!=='string'||!x.new_name.trim()||!ratio(x.new_numerator,x.new_denominator))fail();}
  }else fail();
  if(!ratio(a.numerator,a.denominator))fail();
  if(typeof a.source!=='string')fail();
  try{const u=new URL(a.source);if(u.protocol!=='https:'||!u.hostname||u.username||u.password)fail();}catch{fail();}
  result.set(a.code,a);ids.add(a.id);
 }
 return result;
}
