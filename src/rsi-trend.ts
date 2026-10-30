/** RSI trendlines: rising lows joined in an uptrend (support), falling highs joined in a downtrend (resistance). */
export type TrendPoint={date:string;rsi:number|null};
export type Trendline={kind:'up'|'down';from:{date:string;y:number};to:{date:string;y:number};broken:string|null};

/** Swing points: a value that is the lowest (or highest) within `k` sessions on each side. Gaps break the window. */
export function pivots(series:TrendPoint[],k=3){
 const lows:number[]=[],highs:number[]=[];
 for(let i=k;i<series.length-k;i++){
  const v=series[i].rsi;if(v==null)continue;
  const around=series.slice(i-k,i+k+1).map(p=>p.rsi);
  if(around.some(x=>x==null))continue;
  const vals=around as number[];
  if(vals.every((x,j)=>j===k||x>v))lows.push(i);
  if(vals.every((x,j)=>j===k||x<v))highs.push(i);
 }
 return {lows,highs};
}

/** Each consecutive pair of higher lows (up) or lower highs (down), extended to the right until RSI closes through it. */
export function rsiTrendlines(series:TrendPoint[],k=3):Trendline[]{
 const {lows,highs}=pivots(series,k);const out:Trendline[]=[];
 const build=(idx:number[],kind:'up'|'down')=>{
  for(let n=1;n<idx.length;n++){
   const a=idx[n-1],b=idx[n],ya=series[a].rsi!,yb=series[b].rsi!;
   if(kind==='up'?yb<=ya:yb>=ya)continue;
   const slope=(yb-ya)/(b-a);let end=series.length-1,broken:string|null=null;
   for(let i=b+1;i<series.length;i++){const v=series[i].rsi;if(v==null)continue;const line=ya+slope*(i-a);if(kind==='up'?v<line:v>line){end=i;broken=series[i].date;break;}}
   const y=Math.max(0,Math.min(100,ya+slope*(end-a)));
   out.push({kind,from:{date:series[a].date,y:ya},to:{date:series[end].date,y},broken});
  }
 };
 build(lows,'up');build(highs,'down');
 return out;
}
