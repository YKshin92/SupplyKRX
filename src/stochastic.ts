/** 시장 현황 지수 차트의 스토캐스틱 슬로우(5,3,3).
 *  Fast %K = (종가 − 5일 최저가) ÷ (5일 최고가 − 5일 최저가) × 100,
 *  Slow %K = Fast %K 의 3일 단순평균, Slow %D = Slow %K 의 3일 단순평균 (TradingView 기본 정의와 같음).
 *  A bar without high/low/close, or a window with no range (high = low), gives no value; nothing is filled. */
export type OhlcBar={date:string;high?:number|null;low?:number|null;close?:number|null};
export type StochPoint={date:string;k:number|null;d:number|null};
export const STOCH={n:5,k:3,d:3,low:20,high:80} as const;

const sma=(xs:(number|null)[],m:number)=>xs.map((_,i)=>{
 if(i<m-1)return null;
 const w=xs.slice(i-m+1,i+1);
 return w.some(v=>v==null)?null:(w as number[]).reduce((a,b)=>a+b,0)/m;
});
const ok=(v:number|null|undefined):v is number=>typeof v==='number'&&Number.isFinite(v);

export function stochastic(bars:OhlcBar[],n:number=STOCH.n,ks:number=STOCH.k,ds:number=STOCH.d):StochPoint[]{
 const fast=bars.map((b,i)=>{
  if(i<n-1||!ok(b.close))return null;
  const w=bars.slice(i-n+1,i+1);
  if(!w.every(x=>ok(x.high)&&ok(x.low)))return null;
  const hh=Math.max(...w.map(x=>x.high as number)),ll=Math.min(...w.map(x=>x.low as number));
  return hh>ll?(b.close-ll)/(hh-ll)*100:null;
 });
 const k=sma(fast,ks),d=sma(k,ds);
 return bars.map((b,i)=>({date:b.date,k:k[i],d:d[i]}));
}

export type StochEvents={low:string[];high:string[];lowDays:number;highDays:number;cross:{date:string;kind:'golden'|'dead';k:number}|null};
/** Entry days into the 20-below / 80-above zones (by %K), days spent there, and the latest %K/%D cross. */
export function stochEvents(points:StochPoint[]):StochEvents{
 const out:StochEvents={low:[],high:[],lowDays:0,highDays:0,cross:null};
 let prev:StochPoint|null=null;
 for(const p of points){
  if(p.k==null){prev=null;continue;}
  if(p.k<STOCH.low)out.lowDays++;
  if(p.k>STOCH.high)out.highDays++;
  if(prev&&prev.k!=null){
   if(p.k<STOCH.low&&prev.k>=STOCH.low)out.low.push(p.date);
   if(p.k>STOCH.high&&prev.k<=STOCH.high)out.high.push(p.date);
   if(p.d!=null&&prev.d!=null){
    const a=prev.k-prev.d,b=p.k-p.d;
    if(a<=0&&b>0)out.cross={date:p.date,kind:'golden',k:p.k};
    else if(a>=0&&b<0)out.cross={date:p.date,kind:'dead',k:p.k};
   }
  }
  prev=p;
 }
 return out;
}
export const stochZone=(k:number|null)=>k==null?null:k<STOCH.low?'low':k>STOCH.high?'high':'mid';
