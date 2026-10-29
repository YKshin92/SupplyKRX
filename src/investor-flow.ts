/** Per-stock institution / private-fund flows from the protected recent-period publication. */
import type {Row,Manifest} from './data.ts';
export type FlowInvestorKey='institution'|'pension'|'private';
export const FLOW_INVESTORS:{key:FlowInvestorKey;label:string;investor:string;path:string}[]=[
 {key:'institution',label:'기관합계',investor:'기관합계',path:'institution'},
 {key:'pension',label:'연기금',investor:'연기금 등',path:''},
 {key:'private',label:'사모펀드',investor:'사모',path:'private-fund'},
];
export const flowInvestor=(key:FlowInvestorKey)=>FLOW_INVESTORS.find(f=>f.key===key)!;
export const INSTITUTION_NOTE='기관합계에는 연기금·사모가 포함됩니다. 세 금액을 더하지 마세요.';
type Reader=<T>(path:string)=>Promise<T>;
const cache=new Map<string,Promise<Row[]>>();
const json:Reader=path=>import('./data.ts').then(d=>d.json(path));
/** Loads one stock's rows for a non-pension investor; validates investor label, generation and code. */
export function investorRows(code:string,key:Exclude<FlowInvestorKey,'pension'>,mode='live',period='3m',read:Reader=json):Promise<Row[]>{
 if(!/^[0-9A-Z]{6}$/.test(code))return Promise.reject(Error('invalid stock'));
 const f=flowInvestor(key),root=`/data/${mode}/periods/${period}/${f.path}`,id=`${root}:${code}`;
 if(!cache.has(id)){
  const task=read<Manifest>(`${root}/manifest.json`).then(m=>{
   if(m.investor!==f.investor||!/^generations\/[a-f0-9]{16}$/.test(m.generation))throw Error('invalid investor manifest');
   return read<Row[]>(`${root}/${m.generation}/stocks/${code}.json`);
  }).then(rows=>rows.filter(r=>r.investor===f.investor&&r.code===code));
  task.catch(()=>cache.delete(id));cache.set(id,task);
 }
 return cache.get(id)!;
}
/** Replace the flow series by date; dates without a row stay null (never zero-filled). */
export function withInvestorFlow<T extends {date:string}>(rows:T[],alt:Row[]|null){
 if(!alt)return null;
 const byDate=new Map(alt.map(r=>[r.date,r.net]));let sum=0,broken=false;
 return rows.map(r=>{const net=byDate.get(r.date)??null;if(net==null)broken=true;else sum+=net;return {...r,net,cumulative:broken?null:sum};});
}
export const compactVolume=(v:number)=>v>=1e8?`${(v/1e8).toFixed(1)}억`:v>=1e4?`${Math.round(v/1e4).toLocaleString('ko-KR')}만`:v.toLocaleString('ko-KR');
