import type {SplitAction} from './split-lifecycle.ts';
export type CorporateContext={as_of:string;actions:(SplitAction&{code:string;evidence_on:string;source:string})[]};
export function corporateActionMap(context:CorporateContext|undefined){
 const result=new Map<string,CorporateContext['actions'][number]>();if(context===undefined)return result;
 const fail=():never=>{throw Error('Invalid corporate reconciliation context');};
 const validDay=(v:unknown):v is string=>typeof v==='string'&&/^(?!0000)[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 if(!context||!validDay(context.as_of)||!Array.isArray(context.actions))fail();
 const ids=new Set<string>();
 for(const a of context.actions){
  if(!a||typeof a.code!=='string'||!/^[0-9A-Z]{6}$/.test(a.code)||result.has(a.code)||typeof a.id!=='string'||!a.id.trim()||ids.has(a.id))fail();
  if(![a.known_on,a.halt_start,a.resume_date,a.evidence_on].every(validDay)||!(a.known_on<=a.halt_start&&a.halt_start<a.resume_date&&a.known_on<=a.evidence_on&&a.evidence_on<=context.as_of))fail();
  if(![a.numerator,a.denominator].every(v=>Number.isSafeInteger(v)&&v>0))fail();
  if(typeof a.source!=='string')fail();
  try{const u=new URL(a.source);if(u.protocol!=='https:'||!u.hostname||u.username||u.password)fail();}catch{fail();}
  result.set(a.code,a);ids.add(a.id);
 }
 return result;
}
