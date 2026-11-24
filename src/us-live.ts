/** 시장 현황 · 미국 실시간: Finnhub quotes relayed by /api/quote, and the provisional intraday RSI.
 *  The intraday RSI extends the stored Wilder averages (yesterday's close) by today's live price, exactly as the
 *  next daily run will once the session closes; until then it is shown as 잠정. */
import {nyDate,type Live} from './semis.ts';
export type Wilder={date:string;close:number;avg_gain:number;avg_loss:number;period?:number};
export type MultiQuote={quotes:Record<string,Live>;missing:Record<string,string>;fetched_at:string};
export type LiveView={date:string;price:number;change_pct:number|null;rsi:number|null;state:'below30'|'neutral'|'above70'|null;entry:boolean;fresh:boolean;time:string};
/** Index → ETF that tracks it, used only for the live % line when the free key cannot quote the index itself. */
export const INDEX_PROXY:Record<string,string>={'^GSPC':'SPY','^IXIC':'ONEQ'};
export const LOW=30,HIGH=70,STALE=15*60_000;
export function liveRsi(w:Wilder|null|undefined,price:number):number|null{
 if(!w||!(price>0)||!(w.close>0))return null;
 const n=w.period??14,c=price-w.close;
 const g=(w.avg_gain*(n-1)+Math.max(c,0))/n,l=(w.avg_loss*(n-1)+Math.max(-c,0))/n;
 if(g===0&&l===0)return null;
 return l===0?100:100-100/(1+g/l);
}
/** A quote with no trade for 15 minutes is the last regular-session close (market closed). */
export const isFresh=(q:Live)=>Date.parse(q.fetched_at)-Date.parse(q.time)<STALE;
/** Live view of one series; a quote for a session already in the stored data (or older) is ignored. */
export function liveView(q:Live|undefined,w:Wilder|null|undefined,lastDate:string|null|undefined,storedRsi:number|null):LiveView|null{
 const base=w?.date??lastDate;
 if(!q||!base)return null;
 const date=nyDate(q.time);
 if(date<=base)return null;
 const rsi=liveRsi(w,q.price);
 const ref=q.prev_close??w?.close??null;
 return {date,price:q.price,change_pct:q.change_pct??(ref?(q.price/ref-1)*100:null),rsi,
  state:rsi==null?null:rsi<LOW?'below30':rsi>=HIGH?'above70':'neutral',
  entry:rsi!=null&&storedRsi!=null&&storedRsi>=LOW&&rsi<LOW,fresh:isFresh(q),time:q.time};
}
