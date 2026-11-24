/** SOXX (iShares Semiconductor ETF) cycle view for 시장 현황 · 반도체 지수.
 *  Reference: 양봉업자 투자특강 교재 '내 반도체 주식, 언제까지 버텨야 할까' (2026-11-23). The trader's levels are kept as quoted
 *  (AUTHOR); everything else is recomputed from Yahoo split-adjusted daily bars so it moves with the data.
 *  All Fibonacci levels are on a log scale (the trader's chart: 0.382·0.5·0.618 = 123.5·103.5·86.8 are equal ratios). */
export type SemiRow=[string,number,number,number,number,number];
export type SemiData={schema_version:1;symbol:string;name:string;source:string;fetched_at?:string;as_of:string;prices:SemiRow[]};
export type Bar={date:string;open:number;high:number;low:number;close:number};
export type Point={date:string;price:number};

export const RETRACE=[0.236,0.382,0.5,0.618] as const;
export const EXTEND=[1.272,2] as const;

export function validSemis(d:unknown):d is SemiData{
 const x=d as SemiData;
 return !!x&&x.schema_version===1&&Array.isArray(x.prices)&&x.prices.length>100&&x.prices.every(r=>Array.isArray(r)&&/^\d{4}-\d{2}-\d{2}$/.test(r[0])&&r.slice(1,5).every(v=>typeof v==='number'&&v>0));
}
export const daily=(d:SemiData):Bar[]=>d.prices.map(([date,open,high,low,close])=>({date,open,high,low,close}));

/** Monday of the ISO week of a YYYY-MM-DD date. */
export function weekKey(date:string){const t=new Date(date+'T00:00:00Z');const dow=(t.getUTCDay()+6)%7;t.setUTCDate(t.getUTCDate()-dow);return t.toISOString().slice(0,10);}
/** Weekly OHLC, labelled with the first trading day of the week. */
export function weekly(bars:Bar[]):Bar[]{
 const out:Bar[]=[];let key='';
 for(const b of bars){const k=weekKey(b.date);const w=out.at(-1);
  if(w&&k===key){w.high=Math.max(w.high,b.high);w.low=Math.min(w.low,b.low);w.close=b.close;}
  else{out.push({...b});key=k;}}
 return out;
}
const add=(date:string,months:number)=>{const t=new Date(date+'T00:00:00Z');t.setUTCMonth(t.getUTCMonth()+months);return t.toISOString().slice(0,10);};
function extreme(bars:Bar[],from:string,to:string,kind:'high'|'low'):Point|null{
 let best:Point|null=null;
 for(const b of bars)if(b.date>=from&&b.date<=to){const p=b[kind];if(!best||(kind==='high'?p>best.price:p<best.price))best={date:b.date,price:p};}
 return best;
}
/** Current cycle: high = highest daily high of the last 3 years; low = lowest low in the 18 months before that high
 *  (2026-11: 2025-04-07 49.44 → 2026-06-22 218.65, the trader's 2025 low and 2026 peak). */
export function cycle(bars:Bar[]){
 const last=bars.at(-1);if(!last)return null;
 const high=extreme(bars,add(last.date,-36),last.date,'high');if(!high)return null;
 const low=extreme(bars,add(high.date,-18),high.date,'low');if(!low||low.price>=high.price)return null;
 const after=extreme(bars,high.date,last.date,'low');
 return {low,high,lastLow:after&&after.date>high.date?after:null,last:{date:last.date,price:last.close}};
}
/** Log-scale retracement (0 = high, 1 = low) and extension (from the low, 1 = high). */
export const retrace=(low:number,high:number,r:number)=>high*Math.pow(low/high,r);
export const extend=(low:number,high:number,k:number)=>low*Math.pow(high/low,k);
export const depth=(low:number,high:number,price:number)=>Math.log(high/price)/Math.log(high/low);

/** The trader's own numbers (2026-11-23 material), shown as quoted next to the recomputed ones. */
export const AUTHOR={
 date:'2026-11-23',source:'양봉업자 투자특강 교재 · 11월 4주차',
 boxes:[{label:'1단 박스',price:17.9,note:'2013 수렴 돌파 → 2017~18 달성'},{label:'2단 박스',price:55.1,note:'2020 17.9달러 지지 → 2021 대세 상승 종료'},{label:'3단 박스',price:170,note:'2023~ 생성형 AI → 오버슈팅 뒤 쌍봉·넥라인 붕괴'}],
 boxRatio:55.1/17.9,
 levels:{'0.382':123.5,'0.5':103.54,'0.618':86.81,'1.272':328,'2':970} as Record<string,number>,
 scenario:[
  {step:'하락장 종료',when:'지금',price:'100달러 초반',note:'0.5 자리(약 103달러)를 가장 유력한 저점으로 봄. 블랙스완이면 0.618까지 열어 둠'},
  {step:'반등장',when:'~2028',price:'약 328달러',note:'1.272 자리. 전고점 돌파 심리로 추격이 붙지만 반등장이 끝나는 자리로 봄'},
  {step:'급락 한 차례',when:'반등 이후',price:'—',note:'2020·2024년처럼 1.272에서 반등이 끝난 뒤 큰 폭락이 이어졌던 패턴'},
  {step:'상승장',when:'2029~',price:'600~800 → 900달러대',note:'피보나치 2 자리(약 970달러), 피지컬 AI 사이클'},
 ],
 rules:[
  {when:'수요 탄탄 · 가격(P)만 꺾임',range:'0.236 ~ 0.382'},
  {when:'가격(P)과 수요(Q) 모두 꺾임',range:'0.5 이상'},
  {when:'자산시장 전체 붕괴',range:'0.5 ~ 0.618'},
 ],
};

/** Past corrections the trader quotes, with the windows used here to find (cycle low, peak, trough) in the data. */
export const EPISODES=[
 {name:'2018 조정',why:'수요 탄탄 · 가격만 꺾임',author:0.236,low:['2016-01-01','2016-06-30'],high:['2018-01-01','2018-06-30'],trough:['2018-06-30','2019-06-30']},
 {name:'2020 코로나',why:'자산시장 급락',author:0.618,low:['2018-10-01','2019-06-30'],high:['2020-01-01','2020-03-01'],trough:['2020-03-01','2020-06-30']},
 {name:'2022 긴축',why:'금리 급등 · 자산시장 하락',author:0.5,low:['2020-03-01','2020-06-30'],high:['2021-06-01','2022-03-01'],trough:['2022-01-05','2022-12-31']},
 {name:'2025 이란 전쟁',why:'사이클 둔화 + 대외 변수',author:0.5,low:['2022-09-01','2023-03-31'],high:['2024-01-01','2024-12-31'],trough:['2024-07-12','2025-06-30']},
] as const;
export function episode(bars:Bar[],e:(typeof EPISODES)[number]){
 const low=extreme(bars,e.low[0],e.low[1],'low'),high=extreme(bars,e.high[0],e.high[1],'high');
 if(!low||!high)return null;
 const trough=extreme(bars,high.date>e.trough[0]?high.date:e.trough[0],e.trough[1],'low');
 if(!trough)return null;
 return {low,high,trough,depth:depth(low.price,high.price,trough.price),drawdown:trough.price/high.price-1};
}
/** Extension checks the trader quotes: the rebound or top that followed each cycle vs its 1.272 / 2 level. */
export const EXTENSIONS=[
 {name:'2020년 반등 고점',k:1.272,author:null,low:['2016-01-01','2016-06-30'],high:['2018-01-01','2018-06-30'],actual:['2019-06-01','2020-03-01']},
 {name:'2021년 대세 고점',k:2,author:57,low:['2016-01-01','2016-06-30'],high:['2018-01-01','2018-06-30'],actual:['2021-01-01','2022-03-01']},
 {name:'2024년 반등 고점',k:1.272,author:83,low:['2020-03-01','2020-06-30'],high:['2021-06-01','2022-03-01'],actual:['2023-06-01','2024-12-31']},
 {name:'2026년 고점',k:2,author:203,low:['2020-03-01','2020-06-30'],high:['2021-06-01','2022-03-01'],actual:['2025-06-01','2026-12-31']},
] as const;
export function extensionCheck(bars:Bar[],e:(typeof EXTENSIONS)[number]){
 const low=extreme(bars,e.low[0],e.low[1],'low'),high=extreme(bars,e.high[0],e.high[1],'high'),actual=extreme(bars,e.actual[0],e.actual[1],'high');
 if(!low||!high||!actual)return null;
 const level=extend(low.price,high.price,e.k);
 return {level,actual,gap:actual.price/level-1};
}
/** Where a price sits among the current cycle's levels, for the summary line. */
export function zone(d:number){
 if(d<0)return '고점 위';if(d<0.236)return '0.236 위';if(d<0.382)return '0.236 ~ 0.382';if(d<0.5)return '0.382 ~ 0.5';if(d<0.618)return '0.5 ~ 0.618';if(d<=1)return '0.618 아래';return '사이클 저점 아래';
}

/** /api/quote answer (Finnhub, relayed by the site server). */
export type Live={symbol:string;price:number;open:number|null;high:number|null;low:number|null;prev_close:number|null;change:number|null;change_pct:number|null;time:string;fetched_at:string;source:string};
/** New York calendar date of an ISO time. */
export const nyDate=(iso:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));
/** Puts the live quote on top of the daily bars: today's bar is replaced or appended; an older quote is ignored. */
export function withLive(bars:Bar[],live:Live|null):{bars:Bar[];live:boolean}{
 const last=bars.at(-1);
 if(!live||!last||!(live.price>0))return {bars,live:false};
 const date=nyDate(live.time);
 if(date<last.date)return {bars,live:false};
 const bar={date,open:live.open??live.price,high:Math.max(live.high??live.price,live.price),low:Math.min(live.low??live.price,live.price),close:live.price};
 return {bars:date===last.date?[...bars.slice(0,-1),bar]:[...bars,bar],live:true};
}
