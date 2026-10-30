/** 추격 주의: the latest session is a big up day on a volume spike.
 * In the pre-registered 2026-10-30 study (3 years, all KRX stocks incl. delisted), buying the next open after
 * "volume >= 5x the prior 20-session average and day change >= +5%" lagged the market over 20 sessions in all
 * three periods (-2.2 / -2.3 / -3.9 %p). Monitoring hint only. */
type Bar={date:string;close?:number|null;volume?:number|null;change_pct?:number|null};
export const CHASE_CHANGE=5,CHASE_VOLUME=5;
export function chaseWarning(rows:Bar[]):{date:string;change:number;ratio:number}|null{
 const sorted=[...rows].filter(r=>r.close!=null&&r.close>0&&r.volume!=null&&r.volume>0).sort((a,b)=>a.date.localeCompare(b.date));
 const last=sorted.at(-1);if(!last||last.change_pct==null||last.change_pct<CHASE_CHANGE)return null;
 const prior=sorted.slice(-21,-1).map(r=>r.volume as number);if(prior.length<15)return null;
 const avg=prior.reduce((a,b)=>a+b,0)/prior.length;if(!(avg>0))return null;
 const ratio=(last.volume as number)/avg;
 return ratio>=CHASE_VOLUME?{date:last.date,change:last.change_pct,ratio}:null;
}
