import {parallelParts} from './history-cache.ts';
import type {TrackingData,TrackingEvent} from './tracking.ts';
type Reader=<T>(path:string)=>Promise<T>;
export async function readTracking(root:'tracking-history'|'tracking-events',asOf:string,read:Reader):Promise<TrackingData>{
 const manifest=await read<TrackingData&{files?:string[]}>(`/data/live/${root}.json`);
 if(manifest.schema_version!==1||manifest.as_of!==asOf)throw Error('추적 데이터 기준일이 다릅니다.');
 let events=manifest.events;
 if(manifest.files){
  const pattern=new RegExp(`^${root}-[a-z0-9-]+\\.json$`);
  if(new Set(manifest.files).size!==manifest.files.length||manifest.files.some(f=>!pattern.test(f)))throw Error('Invalid tracking shard');
  const parts=await parallelParts(manifest.files,file=>read<TrackingEvent[]>(`/data/live/${file}`));
  if(parts.some(part=>!Array.isArray(part)))throw Error('Invalid tracking part');
  events=parts.flat();
 }
 return {...manifest,events,...(root==='tracking-history'?{history_available:true}:{history_pending:true})};
}
