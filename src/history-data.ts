import {json,type Row,type Manifest} from './data.ts';
export type HistoryDetail={pension:Row[];foreign:Row[];as_of:string;pending?:boolean};
type Reader=<T>(path:string)=>Promise<T>;
function checked(d:HistoryDetail,code:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(d.as_of)||!Array.isArray(d.pension)||!Array.isArray(d.foreign))throw Error('Invalid history detail');
 for(const [rows,investor] of [[d.pension,'연기금 등'],[d.foreign,'외국인']] as const){const seen=new Set<string>();for(const r of rows){if(r.code!==code||r.investor!==investor||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||r.date>d.as_of||seen.has(r.date))throw Error('History investor/date mismatch');seen.add(r.date);}}
 return d;
}
export async function historyDetail(code:string,signalDate:string,read:Reader=json):Promise<HistoryDetail>{
 if(!/^[0-9A-Z]{6}$/.test(code))throw Error('invalid stock');
 let historical:HistoryDetail;
 try{historical=await read<HistoryDetail>(`/data/live/history-stock-${code}.json`);}
 catch{
  const root='/data/live/periods/3m';
  const [p,f]=await Promise.all([read<Manifest>(`${root}/manifest.json`),read<Manifest>(`${root}/foreign/manifest.json`)]);
  if(!p.sessions?.length||signalDate<p.sessions[0]||p.as_of!==f.as_of||![p,f].every(m=>/^generations\/[a-f0-9]{16}$/.test(m.generation)))throw Error('Historical detail is not ready');
  const [pension,foreign]=await Promise.all([read<Row[]>(`${root}/${p.generation}/stocks/${code}.json`),read<Row[]>(`${root}/foreign/${f.generation}/stocks/${code}.json`)]);
  return checked({pension,foreign,as_of:p.as_of,pending:true},code);
 }
 return checked(historical,code);
}
