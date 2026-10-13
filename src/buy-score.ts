import type {TrackingEvent,ScoreInputs} from './tracking';
const valid=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
// v2: quiet trading is an eligibility gate, never an additional score.
// Latest market cap is explicit: this is a monitoring score, not an entry-time backtest.
export function buyScore(e:TrackingEvent&ScoreInputs){
 const flow=(buy:number|null|undefined,net:number|null|undefined,max:number)=>
  !valid(buy)||!valid(net)||buy<0?null:buy===0?0:
   max*clamp(Math.log1p(buy/1e8)/Math.log1p(30))*clamp(net/buy);
 const pension=flow(e.signal_buy,e.signal_net,35);
 const foreign=flow(e.foreign_buy,e.foreign_net,15);
 const ratio=valid(e.market_cap)&&e.market_cap>0&&valid(e.signal_net)?Math.max(0,e.signal_net)/e.market_cap:null;
 const relative=ratio===null?null:50*clamp(Math.log1p(ratio/0.0001)/Math.log1p(10));
 const parts=[{label:'시총 대비',value:relative,max:50},{label:'연기금',value:pension,max:35},{label:'외국인',value:foreign,max:15}];
 const complete=parts.every(p=>p.value!==null);
 return {total:complete?Math.round(parts.reduce((s,p)=>s+p.value!,0)):null,parts,ratio,coverage:parts.filter(p=>p.value!==null).reduce((s,p)=>s+p.max,0)};
}
