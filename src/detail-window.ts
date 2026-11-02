/** Shared event-centred window; never substitutes a recent period for an absent event. */
export function detailWindow<T extends {date:string}>(rows:T[],signalDate:string,exitDate?:string|null,issueDate?:string|null){
 const index=rows.findIndex(r=>r.date===signalDate);
 if(index<0)return {rows:[] as T[],before:0,after:0,signalFound:false};
 let end=index+41;
 for(const date of [exitDate,issueDate])if(date){const i=rows.findIndex(r=>r.date===date);if(i>=0)end=Math.max(end,i+11);}
 const start=Math.max(0,index-20),stop=Math.min(rows.length,end);
 return {rows:rows.slice(start,stop),before:index-start,after:stop-index-1,signalFound:true};
}
/** Same boundary as the published 3m period: as_of minus N calendar months (day clamped), inclusive. */
export function recentStart(asOf:string,months=3){
 const [y,m,d]=asOf.split('-').map(Number),index=y*12+(m-1)-months,year=Math.floor(index/12),month=index-year*12+1;
 const last=new Date(Date.UTC(year,month,0)).getUTCDate();
 return `${year}-${String(month).padStart(2,'0')}-${String(Math.min(d,last)).padStart(2,'0')}`;
}
export function recentWindow<T extends {date:string}>(rows:T[],asOf:string,signalDate:string,months=3){
 const start=recentStart(asOf,months),selected=rows.filter(r=>r.date>=start&&r.date<=asOf);
 return {rows:selected,start,signalFound:selected.some(r=>r.date===signalDate)};
}
/** Signal-centred window: the 3 calendar months before the signal (the "3개월 무거래" check), then at least 3 months after it
 *  or through the exit / issue date plus 10 sessions, whichever is later. When the latest data cuts the end short, the
 *  start moves back so the window still spans 6 months where the data allows. */
export function signalWindow<T extends {date:string}>(rows:T[],signalDate:string,exitDate?:string|null,issueDate?:string|null){
 const index=rows.findIndex(r=>r.date===signalDate);
 const quietStart=recentStart(signalDate,3);
 if(index<0)return {rows:[] as T[],quietStart,before:0,after:0,signalFound:false};
 const plus3=recentStart(signalDate,-3);let stop=index+1;while(stop<rows.length&&rows[stop].date<=plus3)stop++;
 for(const date of [exitDate,issueDate])if(date){const i=rows.findIndex(r=>r.date===date);if(i>=0)stop=Math.max(stop,Math.min(rows.length,i+11));}
 const last=rows[stop-1].date,earliest=[quietStart,recentStart(last,6)].sort()[0];
 let start=index;while(start>0&&rows[start-1].date>=earliest)start--;
 return {rows:rows.slice(start,stop),quietStart,before:index-start,after:stop-index-1,signalFound:true};
}
