export type Outcome={split:string;reason:string|null;gross:number|null;benchmark:number|null;anomaly:boolean;entry_date:string|null;exit_date:string|null;entry_open:number|null;exit_close:number|null;max_up:number|null;max_down:number|null;sale_exit?:number|null};
export type ResearchEvent={id:string;code:string;name:string;market:string;signal_date:string;signal_net:number;signal_buy:number|null;signal_sell:number|null;flow_ratio:number|null;foreign_net:number|null;foreign5:number|null;prior5:number|null;above_ma20:number|null;volume_ratio:number|null;volatility20:number|null;quiet_days:number;quiet_censored:boolean;zero_filled_prior:number;current_return:number|null;market_cap:number|null;sector:string|null;metadata_date:string|null;rules:string[];outcomes:Record<string,Outcome>};
export const netResearchReturn=(gross:number,cost:number)=>((1+gross/100)*(1-cost/200)/(1+cost/200)-1)*100;
export function researchStats(events:ResearchEvent[],horizon:string,split:string,cost:number,anomalies:boolean){
 const cohort=events.filter(e=>split==='all'||e.outcomes[horizon].split===split);
 const valid=cohort.filter(e=>{const o=e.outcomes[horizon];return o.reason===null&&o.gross!==null&&(anomalies||!o.anomaly);});
 const values=valid.map(e=>netResearchReturn(e.outcomes[horizon].gross!,cost)).sort((a,b)=>a-b);
 const mean=(xs:number[])=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
 const median=values.length?values.length%2?values[(values.length-1)/2]:(values[values.length/2-1]+values[values.length/2])/2:null;
 const gains=values.filter(v=>v>0),losses=values.filter(v=>v<0),n=values.length,p=n?gains.length/n:0,z=1.96;
 const center=(p+z*z/(2*Math.max(n,1)))/(1+z*z/Math.max(n,1)),width=z*Math.sqrt(p*(1-p)/Math.max(n,1)+z*z/(4*Math.max(n,1)**2))/(1+z*z/Math.max(n,1));
 const excess=valid.flatMap(e=>e.outcomes[horizon].benchmark==null?[]:[netResearchReturn(e.outcomes[horizon].gross!,cost)-e.outcomes[horizon].benchmark!]);
 const excluded=cohort.reduce<Record<string,number>>((a,e)=>{const o=e.outcomes[horizon];const reason=o.reason||(!anomalies&&o.anomaly?'price_anomaly':'');if(reason)a[reason]=(a[reason]??0)+1;return a;},{});
 return {total:cohort.length,n,mean:mean(values),gross:mean(valid.map(e=>e.outcomes[horizon].gross!)),median,win:n?p*100:null,winCI:n?[100*(center-width),100*(center+width)]:null,
 gain:mean(gains),loss:mean(losses),withoutTop:mean(values.slice(0,-Math.max(1,Math.ceil(n*.05)))),excess:mean(excess),dates:new Set(valid.map(e=>e.signal_date)).size,excluded,valid};
}
