import type {Dataset} from './data';

/** Summary sparks follow each dataset's own last 20 sessions, not array offsets across datasets. */
export function aggregateFlow(dataset: Dataset) {
  const dates=dataset.manifest.sessions.filter(d=>d<=dataset.manifest.as_of).slice(-(dataset.manifest.days||20));
  return dates.map((date,index)=>{
    const values=dataset.stocks.map(s=>s.spark[index]).filter((v):v is number=>v!=null&&Number.isFinite(v));
    return {date,net:values.length?values.reduce((a,b)=>a+b,0):null,known:values.length,total:dataset.stocks.length};
  });
}

/** Sum observed values across the selected dates; report missing coverage explicitly. */
export function periodFlowTotal(dataset: Dataset) {
  const rows=aggregateFlow(dataset);
  const values=rows.filter(r=>r.net!==null);
  return {net:dataset.manifest.status==='calendar_unverified'||!values.length?null:values.reduce((sum,r)=>sum+r.net!,0),partial:rows.some(r=>r.known<r.total),days:rows.length};
}
