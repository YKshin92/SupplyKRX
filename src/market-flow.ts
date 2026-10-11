import type {Dataset} from './data';

/** Summary sparks follow each dataset's own last 20 sessions, not array offsets across datasets. */
export function aggregateFlow(dataset: Dataset) {
  const dates=dataset.manifest.sessions.filter(d=>d<=dataset.manifest.as_of).slice(-(dataset.manifest.days||20));
  return dates.map((date,index)=>{
    const values=dataset.stocks.map(s=>s.spark[index]).filter((v):v is number=>v!=null&&Number.isFinite(v));
    return {date,net:values.length?values.reduce((a,b)=>a+b,0):null,known:values.length,total:dataset.stocks.length};
  });
}
