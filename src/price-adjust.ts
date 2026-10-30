/** 수정주가 for charts: same rule as collector/price_adjust.py (exchange change rate explains the break). */
export const ADJUST_THRESHOLD=5;
type Bar={date:string;open?:number|null;high?:number|null;low?:number|null;close?:number|null;volume?:number|null;change_pct?:number|null};
export type Adjustment={date:string;factor:number};
export function adjustmentPoints(rows:Bar[]):Adjustment[]{
 const out:Adjustment[]=[];let prev:Bar|null=null;
 for(const r of [...rows].sort((a,b)=>a.date.localeCompare(b.date))){
  if(r.close==null||r.close<=0){prev=null;continue;}
  if(prev&&prev.close&&r.change_pct!=null&&r.change_pct>-100){const actual=(r.close/prev.close-1)*100;if(Math.abs(actual-r.change_pct)>ADJUST_THRESHOLD){const factor=r.close/(1+r.change_pct/100)/prev.close;if(factor>0)out.push({date:r.date,factor});}}
  prev=r;
 }
 return out;
}
/** Rows before each adjustment date get prices × factor and volume ÷ factor. Returns new objects; input untouched. */
export function adjustRows<T extends Bar>(rows:T[]):{rows:T[];points:Adjustment[]}{
 const points=adjustmentPoints(rows);if(!points.length)return {rows,points};
 const out=rows.map(r=>{const f=points.filter(p=>p.date>r.date).reduce((a,p)=>a*p.factor,1);if(f===1)return r;const s=(v:number|null|undefined)=>v==null?v:v*f;return {...r,open:s(r.open),high:s(r.high),low:s(r.low),close:s(r.close),volume:r.volume==null?r.volume:r.volume/f};});
 return {rows:out,points};
}
/** '2026-10-02 10:1 병합' style labels. */
export const adjustLabel=(points:Adjustment[])=>points.map(p=>{const f=p.factor>=1?p.factor:1/p.factor;const n=Math.abs(f-Math.round(f))<0.05?String(Math.round(f)):f.toFixed(2);return `${p.date} ${p.factor>=1?`${n}:1 병합`:`1:${n} 분할`}`;}).join(', ');
