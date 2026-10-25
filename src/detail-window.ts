/** Shared event-centred window; never substitutes a recent period for an absent event. */
export function detailWindow<T extends {date:string}>(rows:T[],signalDate:string,exitDate?:string|null,issueDate?:string|null){
 const index=rows.findIndex(r=>r.date===signalDate);
 if(index<0)return {rows:[] as T[],before:0,after:0,signalFound:false};
 let end=index+41;
 for(const date of [exitDate,issueDate])if(date){const i=rows.findIndex(r=>r.date===date);if(i>=0)end=Math.max(end,i+11);}
 const start=Math.max(0,index-20),stop=Math.min(rows.length,end);
 return {rows:rows.slice(start,stop),before:index-start,after:stop-index-1,signalFound:true};
}
