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
 /** The cycle the material is about; its quoted levels are shown only while the page is on this cycle. */
 cycle:{low:'2025-04-07',high:'2026-06-22'},
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

/* ── 교재의 차트 패턴(추세선 · W · 쌍봉)을 자료에서 다시 찾기 (2026-11-25) ── */
const logAt=(a:{i:number;p:number},b:{i:number;p:number},i:number)=>Math.exp(Math.log(a.p)+(Math.log(b.p)-Math.log(a.p))*(i-a.i)/(b.i-a.i));
/** 수렴: the line through the 2001 high and the 2011 high on weekly bars (log scale), and the first weekly close above it. */
export function convergence(weeks:Bar[]){
 const pick=(from:string,to:string)=>{let best=-1;weeks.forEach((w,i)=>{if(w.date>=from&&w.date<=to&&(best<0||w.high>weeks[best].high))best=i;});return best;};
 const i1=pick('2001-01-01','2002-12-31'),i2=pick('2011-01-01','2011-12-31');
 if(i1<0||i2<=i1)return null;
 const a={i:i1,p:weeks[i1].high},b={i:i2,p:weeks[i2].high};
 let k=-1;for(let i=i2+8;i<weeks.length;i++)if(weeks[i].close>logAt(a,b,i)){k=i;break;}
 if(k<0)return null;
 const end=Math.min(weeks.length-1,k+78);
 return {from:{date:weeks[i1].date,price:a.p},mid:{date:weeks[i2].date,price:b.p},to:{date:weeks[end].date,price:logAt(a,b,end)},breakout:{date:weeks[k].date,price:weeks[k].close}};
}
/** 쌍봉: second peak = highest high at least 30 days after the cycle high; neckline = lowest low between the peaks;
 *  broken = first daily close under the neckline after the second peak. */
export function doubleTop(bars:Bar[],high:Point){
 const after=add(high.date,1);
 const second=extreme(bars,after,'9999-12-31','high');if(!second)return null;
 const neck=extreme(bars,high.date,second.date,'low');if(!neck||neck.date<=high.date||neck.date>=second.date)return null;
 const broken=bars.find(b=>b.date>second.date&&b.close<neck.price);
 return {first:high,second,neck,broken:broken?{date:broken.date,price:broken.close}:null};
}
/** The trader's W(쌍바닥) markings, as date windows; the box height comes from the data. */
export const W_PATTERNS=[{name:'W 2018~2019',from:'2018-03-01',to:'2019-12-31'},{name:'W 2022~2023',from:'2021-12-01',to:'2023-06-30'}] as const;
export function windowRange(bars:Bar[],from:string,to:string){const lo=extreme(bars,from,to,'low'),hi=extreme(bars,from,to,'high');return lo&&hi?{low:lo.price,high:hi.price}:null;}

/** 교재의 사이클별 배경 설명과 용어 풀이를 요약한 것 (작성자 견해). */
export const STORY={
 cycles:[
  {period:'2013~2018',title:'모바일',box:'수렴 돌파 → 1단 박스 17.9달러',points:['스마트폰 보급: 삼성·애플 양강에 중국 업체가 가세','통신이 3G에서 4G(LTE)로 교체','PC 중심이던 수요에 모바일이라는 새 수요처가 열림'],end:'2018년 고점 뒤 조정은 0.236에서 마무리 — 수요(Q)는 버티고 가격(P)만 꺾였기 때문'},
  {period:'2020~2022',title:'언택트',box:'17.9달러 지지 → 2단 박스 55.1달러',points:['제로금리·양적완화로 유동성이 풀림','비대면 확산으로 노트북·태블릿 수요 급증','클라우드 사용이 늘며 데이터센터 투자 확대'],end:'물가 급등에 연준이 빅스텝·자이언트스텝으로 금리를 올리며 자산시장 전체가 하락, 0.5에서 마무리'},
  {period:'2023~2026',title:'생성형 AI',box:'W 완성 → 3단 박스 170달러(오버슈팅)',points:['2023년 GPT 등장','GPU·HBM 수요 폭증','2025~26년 장기 공급계약이 나오며 “반도체는 사이클이 아니다”라는 말까지 등장'],end:'많이 오른 만큼 많이 빠지는 과정 — 쌍봉을 만들고 넥라인이 무너지며 급락'},
  {period:'2029~',title:'피지컬 AI(작성자 전망)',box:'다음 박스 500달러 이상 · 확장 2 약 970달러',points:['AI 사이클은 끝나지 않았다는 것이 작성자 생각','반등장(~2028) 뒤 급락을 한 번 거친 다음 시작','“급하게 오르면 급하게 빠지고, 급하게 빠지면 또 급하게 오른다”'],end:'먼 이야기이므로 참고만'},
 ],
 why1272:['1.272는 전고점을 살짝 넘는 가격대입니다. 이 자리를 뚫고 올라가면 진짜 상승장일 가능성이 커지고, 못 뚫으면 전고점 돌파가 가짜로 끝나며 큰 하락이 나오는 패턴이 있었다는 것이 작성자 설명입니다.','그래서 W 모양으로 꽤 크게 오른 구간도 ‘상승장’이 아니라 ‘반등장’이라고 부릅니다.'],
 why328:['328달러에 닿으면 전고점을 넘었다는 심리 때문에 따라 사는 사람이 많아집니다.','하지만 작성자는 그 자리를 반등장이 끝나는 1.272로 보고, 전량 매도 자리로 봅니다.','그 뒤 급락이 한 차례 오고, 거기서 잘 산 사람이 2029년부터의 사이클을 노릴 수 있다는 구상입니다.'],
 now:['2018년과 달리 이번에는 0.236이 깨졌고, 11월 셋째 주 금요일에 0.382에 닿았습니다.','반도체 가격(P)은 살짝 꺾이기 시작했지만 수요(Q)는 탄탄해 0.382를 지킬 수 있다고 봤는데, 나스닥 전체가 무너지는 변수가 생겼다는 것이 작성자 판단입니다.','그래서 0.5(약 103달러)를 가장 유력한 저점으로, 블랙스완(예: 네오클라우드 업체 부실로 연쇄 청산)이 터지면 0.618까지 열어 둡니다.','진짜 저점은 맞힐 수 없으니 0.382 · 0.5 · 0.618이 올 때마다 3분할로 접근하자는 제안입니다.'],
 glossary:[
  ['반등장','하락 뒤 크게 오르지만 전고점 부근에서 다시 꺾이는 구간. 교재에서는 W자 상승을 이렇게 부름'],['상승장','전고점을 확실히 넘어 몇 년간 이어지는 장기 상승 구간'],
  ['수렴','고점은 낮아지고 저점은 높아지며 가격 폭이 좁아지는 구간. 돌파한 방향으로 큰 움직임이 자주 나옴'],['박스 목표치','수렴 구간의 높이만큼을 돌파 지점 위에 더해 목표가를 잡는 방법'],
  ['피보나치 되돌림','직전 상승폭의 0.236 · 0.382 · 0.5 · 0.618 자리에서 조정이 멈추는지 보는 방법. 숫자가 클수록 깊은 조정'],['1.272(피보나치 확장)','직전 상승폭의 1.272배 자리. 전고점을 살짝 넘는 가격대'],
  ['P · Q','P는 반도체 가격, Q는 수요·판매량. 둘 중 무엇이 꺾이느냐로 조정 깊이를 가늠'],['W 패턴(쌍바닥)','비슷한 저점을 두 번 찍고 올라가는 모양. 바닥을 다졌다는 신호로 봄'],
  ['쌍봉 · 넥라인','비슷한 고점을 두 번 찍는 모양. 두 고점 사이 저점을 이은 선(넥라인)이 무너지면 하락 신호'],['로그 차트','가격의 변화율을 같은 간격으로 보여 주는 차트. 장기 차트에 씀'],
  ['HBM','고대역폭 메모리. AI용 GPU 옆에 붙는 고성능 D램'],['양적긴축','중앙은행이 금리를 올리고 시중 돈을 거둬들이는 정책'],['빅스텝 · 자이언트스텝','기준금리를 한 번에 0.5%p · 0.75%p 올리는 것'],
  ['블랙스완','예측하기 어렵지만 일어나면 충격이 큰 사건'],['네오클라우드','엔비디아 GPU를 대량으로 들여와 AI 연산을 빌려주는 신생 클라우드 업체'],['추세 추종','오르는 방향을 따라 사고 내리는 방향을 따라 파는 매매 방식'],
 ] as [string,string][],
};

/* ── 사이클 단계 자동 판정 (2026-11-25) ──
 * 교재의 과거 설명은 같은 순서를 되풀이한다: 기준 상승(저점 L → 고점 H) → ① 조정 → ② 반등장(1.272 부근에서 끝) →
 * ③ 급락 한 차례 → ④ 상승장(확장 2 부근에서 끝) → 그 급락 저점과 새 고점이 다음 사이클의 L · H.
 * 교재가 더 나오지 않으므로 이 순서를 규칙으로 옮겨 2016년부터 일봉 종가로 다시 돌린다(확정 종가만, 장중 시세 제외).
 *  · 꺾임 확인: 종가가 구간 최고가보다 20% 이상 아래(DROP).
 *  · 돌아섬 확인: 저점 뒤 20거래일(AGE)이 지나고, 종가가 하락폭의 절반(로그 중간값 = √(고점×저점)) 이상 회복.
 *  · 반등이 전고점을 못 넘고 꺾이거나, 확인 뒤 저점을 다시 깨면 이전 단계로 되돌린다.
 * 20% · 20거래일은 교재에 없는 값이다. 20~25% · 10~20거래일에서는 교재와 같은 세 사이클(2016→18, 2020→22, 2025→26)이 나오고
 * 30%에서는 2018년 조정(−27%)을 놓친다. 사례가 세 사이클뿐이라 통계 검증은 아니다. */
export const STAGE={drop:0.2,age:20} as const;
export type Phase='correction'|'rebound'|'crash'|'bull';
export type StageEvent={date:string;kind:'rebound'|'crash'|'bull'|'top'|'rebound_failed'|'bull_failed';price:number;ref?:Point};
export type StageState={low:Point;high:Point;phase:Phase;trough:Point;troughAge:number;peak:Point|null;reboundPeak:Point|null;crashLow:Point|null;crashAge:number;
 failedPeak:number|null;confirm:number|null;events:StageEvent[];since:number};
export function stages(bars:Bar[],drop:number=STAGE.drop,age:number=STAGE.age):StageState|null{
 const seedL=extreme(bars,'2016-01-01','2016-06-30','low'),seedH=extreme(bars,'2018-01-01','2018-06-30','high');
 if(!seedL||!seedH)return null;
 let low=seedL,high=seedH,phase:Phase='correction';
 let trough:Point={...seedH},ti=bars.findIndex(b=>b.date===seedH.date);
 let peak:Point|null=null,rebound:Point|null=null,crash:Point|null=null,ci=0,failed:number|null=null,since=0;
 const events:StageEvent[]=[];
 const start=ti+1;
 for(let i=start;i<bars.length;i++){
  const b=bars[i];
  if(phase==='correction'){
   if(b.low<trough.price){trough={date:b.date,price:b.low};ti=i;failed=null;}
   const level=Math.max(Math.sqrt(high.price*trough.price),failed??0);
   if(trough.price<high.price*(1-drop)&&i-ti>=age&&b.close>=level){phase='rebound';peak={date:b.date,price:b.high};events.push({date:b.date,kind:'rebound',price:b.close,ref:trough});}
  }else if(phase==='rebound'){
   if(b.high>peak!.price)peak={date:b.date,price:b.high};
   if(b.close<trough.price){phase='correction';failed=null;trough={date:b.date,price:b.low};ti=i;events.push({date:b.date,kind:'rebound_failed',price:b.close});}
   else if(b.close<=peak!.price*(1-drop)){
    if(peak!.price>=high.price){rebound=peak;phase='crash';crash={date:b.date,price:b.low};ci=i;events.push({date:b.date,kind:'crash',price:b.close,ref:rebound!});}
    else{phase='correction';failed=peak!.price;events.push({date:b.date,kind:'rebound_failed',price:b.close,ref:peak!});}
   }
  }else if(phase==='crash'){
   if(b.low<crash!.price){crash={date:b.date,price:b.low};ci=i;}
   if(i-ci>=age&&b.close>=Math.sqrt(rebound!.price*crash!.price)){phase='bull';peak={date:b.date,price:b.high};events.push({date:b.date,kind:'bull',price:b.close,ref:crash!});}
  }else{
   if(b.high>peak!.price)peak={date:b.date,price:b.high};
   if(b.close<crash!.price){phase='crash';crash={date:b.date,price:b.low};ci=i;events.push({date:b.date,kind:'bull_failed',price:b.close});}
   else if(b.close<=peak!.price*(1-drop)){
    if(peak!.price>rebound!.price){
     events.push({date:b.date,kind:'top',price:b.close,ref:peak!});
     low=crash!;high=peak!;phase='correction';failed=null;since=events.length;
     const hi=bars.findIndex(x=>x.date===high.date);ti=hi;trough={date:b.date,price:b.low};
     for(let j=hi+1;j<=i;j++)if(bars[j].low<=trough.price){trough={date:bars[j].date,price:bars[j].low};ti=j;}
     rebound=null;crash=null;peak=null;
    }else{phase='crash';events.push({date:b.date,kind:'bull_failed',price:b.close,ref:peak!});}
   }
  }
 }
 const n=bars.length-1;
 const confirm=phase==='correction'?Math.max(Math.sqrt(high.price*trough.price),failed??0):phase==='crash'?Math.sqrt(rebound!.price*crash!.price):null;
 return {low,high,phase,trough,troughAge:n-ti,peak,reboundPeak:rebound,crashLow:crash,crashAge:crash?n-ci:0,failedPeak:failed,confirm,events,since};
}
/** Cycle view from fixed anchors (the stage machine's L · H), with the lowest low since the high. */
export function cycleFrom(bars:Bar[],low:Point,high:Point){
 const last=bars.at(-1);if(!last)return null;
 const after=extreme(bars,high.date,last.date,'low');
 return {low,high,lastLow:after&&after.date>high.date?after:null,last:{date:last.date,price:last.close}};
}
