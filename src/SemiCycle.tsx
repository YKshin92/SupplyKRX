import {useEffect,useMemo,useState} from 'react';
import {ResponsiveContainer,ComposedChart,Line,Bar,XAxis,YAxis,Tooltip,CartesianGrid,ReferenceLine,ReferenceArea,ReferenceDot} from 'recharts';
import {AUTHOR,EPISODES,EXTEND,EXTENSIONS,RETRACE,STAGE,STORY,W_PATTERNS,convergence,cycleFrom,doubleTop,stages,windowRange,cycle,daily,depth,episode,extend,extensionCheck,retrace,validSemis,weekKey,weekly,withLive,zone,type Bar as Ohlc,type Phase,type StageEvent,type StageState,type Live,type SemiData} from './semis';
import './semis.css';

const usd=(v:number|null|undefined,d=2)=>v==null?'—':`$${v.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d})}`;
const pct=(v:number|null|undefined,d=1)=>v==null?'—':`${v>0?'+':v<0?'−':''}${Math.abs(v*100).toFixed(d)}%`;
const LOG_TICKS=[1,2,5,10,20,50,100,200,500,1000];
const ticksIn=(lo:number,hi:number,fine=false)=>[...LOG_TICKS,...(fine?[30,40,60,80,150,300]:[])].filter(t=>t>=lo&&t<=hi).sort((a,b)=>a-b);

/** Candle on a log axis: the Bar spans [low, high]; open/close are placed by log distance inside it. */
function LogCandle(props:unknown){
 const {x,y,width,height,payload}=props as {x:number;y:number;width:number;height:number;payload:Ohlc};
 if(!payload||!(height>0))return null;
 const span=Math.log(payload.high/payload.low)||1;
 const at=(v:number)=>y+Math.log(payload.high/v)/span*height;
 const up=payload.close>=payload.open,color=up?'var(--semi-up)':'var(--semi-down)';
 const top=Math.min(at(payload.open),at(payload.close)),body=Math.max(Math.abs(at(payload.close)-at(payload.open)),1);
 const w=Math.max(width*0.7,1),bx=x+(width-w)/2;
 return <g><line x1={x+width/2} x2={x+width/2} y1={y} y2={y+height} stroke={color}/><rect x={bx} y={top} width={w} height={body} fill={color} rx={1}/></g>;
}

const POLL=60_000;
/** Phone width: charts drop the long labels and the wide right gutter. */
function useNarrow(){
 const [narrow,setNarrow]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(max-width:600px)').matches);
 useEffect(()=>{const m=window.matchMedia('(max-width:600px)'),f=()=>setNarrow(m.matches);m.addEventListener('change',f);return ()=>m.removeEventListener('change',f);},[]);
 return narrow;
}
const kst=(iso:string)=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso));
type LiveState={kind:'loading'|'on'|'off'|'error';message?:string};
/** Polls /api/quote every minute while the page is visible; stops for good when the key is not configured. */
function useLiveQuote(){
 const [quote,setQuote]=useState<Live|null>(null),[state,setState]=useState<LiveState>({kind:'loading'});
 useEffect(()=>{
  let stop=false,timer:ReturnType<typeof setTimeout>|undefined;
  const tick=async()=>{
   if(stop)return;
   if(document.visibilityState==='visible'){
    try{
     const r=await fetch('/api/quote?symbol=SOXX',{cache:'no-store',credentials:'same-origin'});
     const body=await r.json().catch(()=>({}));
     if(r.ok){setQuote(body as Live);setState({kind:'on'});}
     else if(body?.error==='not_configured'){setState({kind:'off',message:body.message});return;}
     else setState({kind:'error',message:body?.message??body?.error??`시세 응답 오류(${r.status})`});
    }catch{setState({kind:'error',message:'시세 서버에 연결하지 못했습니다.'});}
   }
   if(!stop)timer=setTimeout(tick,POLL);
  };
  void tick();
  const wake=()=>{if(document.visibilityState==='visible'){clearTimeout(timer);void tick();}};
  document.addEventListener('visibilitychange',wake);
  return ()=>{stop=true;clearTimeout(timer);document.removeEventListener('visibilitychange',wake);};
 },[]);
 return {quote,state};
}

const PHASES:Phase[]=['correction','rebound','crash','bull'];
const STEP=['조정(하락장)','반등장','급락 한 차례','상승장'];
const NEXT_KIND=['rebound','crash','bull','top'] as const;
const session=(n:number)=>`${n}거래일`;
/** 사이클 단계 자동 판정: the four steps of the course material, driven by the rule in semis.ts (confirmed daily closes). */
function StagePanel({st,match,L,H}:{st:StageState;match:boolean;L:number;H:number}){
 const at=PHASES.indexOf(st.phase),mine=st.events.slice(st.since);
 const half=Math.round(STAGE.drop*100);
 const done=(i:number)=>[...mine].reverse().find(e=>e.kind===NEXT_KIND[i]);
 const t=st.trough,deep=depth(L,H,t.price);
 const aging=st.troughAge<STAGE.age;
 const detail=[
  at===0?`저점 ${usd(t.price)}(${t.date}) · 고점 대비 ${pct(t.price/H-1)} · 되돌림 ${deep.toFixed(3)} · 저점 뒤 ${session(st.troughAge)}`:`저점 ${usd(t.price)}(${t.date}) · 되돌림 ${deep.toFixed(3)}`,
  at===1&&st.peak?`구간 최고가 ${usd(st.peak.price)}(${st.peak.date}) · 목표 1.272 = ${usd(extend(L,H,1.272),0)}`:`목표 1.272 = ${usd(extend(L,H,1.272),0)} · 전고점 ${usd(H,0)}을 살짝 넘는 자리`,
  at===2&&st.crashLow?`급락 저점 ${usd(st.crashLow.price)}(${st.crashLow.date}) · 저점 뒤 ${session(st.crashAge)}`:'반등장이 1.272 부근에서 끝난 뒤의 큰 하락(2020 코로나 · 2025년)',
  at===3&&st.peak?`구간 최고가 ${usd(st.peak.price)}(${st.peak.date}) · 목표 확장 2 = ${usd(extend(L,H,2),0)}`:`목표 확장 2 = ${usd(extend(L,H,2),0)}`,
 ];
 const rule=[
  `저점 뒤 ${STAGE.age}거래일이 지나고 종가가 하락폭의 절반 이상 회복하면 반등장으로`,
  `종가가 구간 최고가보다 ${half}% 이상 내려가면 급락으로(전고점을 못 넘고 꺾이면 조정으로 되돌림)`,
  `저점 뒤 ${STAGE.age}거래일이 지나고 종가가 하락폭의 절반 이상 회복하면 상승장으로`,
  `종가가 구간 최고가보다 ${half}% 이상 내려가면 사이클 종료 → 급락 저점과 새 고점으로 다음 사이클`,
 ];
 const now=at===0?(st.trough.price>H*(1-STAGE.drop)?`고점 대비 하락이 아직 ${half}% 미만입니다.`:aging?`하락 진행 중 — 최저가를 ${session(st.troughAge)} 전에 새로 썼습니다(${STAGE.age}거래일 동안 안 깨져야 저점 후보).`:`저점 다지기 — 최저가가 ${session(st.troughAge)}째 깨지지 않았습니다.`)
  :at===1?'반등장 — 1.272 부근이 반등이 끝나는 자리입니다.':at===2?(st.crashAge<STAGE.age?'급락 진행 중입니다.':'급락 뒤 저점 다지기입니다.'):'상승장 — 확장 2 부근이 목표입니다.';
 const need=st.confirm!=null?`다음 단계 조건: 종가 ${usd(st.confirm)} 이상${st.failedPeak&&st.confirm===st.failedPeak?'(지난 반등 실패 고점)':'(하락폭 절반 회복)'}${(at===0?st.troughAge:st.crashAge)<STAGE.age?` + 저점 뒤 ${STAGE.age}거래일(지금 ${session(at===0?st.troughAge:st.crashAge)})`:''}`
  :st.peak?`다음 단계 조건: 종가 ${usd(st.peak.price*(1-STAGE.drop))} 이하(구간 최고가 ${usd(st.peak.price)}의 −${half}%)`:'';
 const label=(e:StageEvent)=>e.kind==='rebound'?'반등장 진입 확인':e.kind==='crash'?'반등 끝 · 급락 확인':e.kind==='bull'?'상승장 진입 확인':e.kind==='top'?'상승장 끝 · 새 사이클 시작':e.kind==='rebound_failed'?(e.ref?'반등 실패(전고점을 못 넘고 꺾임) → 조정으로':'반등 실패(저점 경신) → 조정으로'):e.ref?'상승 실패(반등 고점을 못 넘고 꺾임) → 급락으로':'상승 실패(급락 저점 경신) → 급락으로';
 const basis=(e:StageEvent)=>!e.ref?'—':`${e.kind==='rebound'||e.kind==='bull'?'저점':'고점'} ${usd(e.ref.price)}(${e.ref.date}) 대비 ${pct(e.price/e.ref.price-1,0)}`;
 return <section className="semi-block semi-stage" aria-label="사이클 단계">
  <h4>지금 단계 <small>교재가 설명한 사이클 순서(조정 → 반등장 → 급락 → 상승장)를 규칙으로 옮겨 매일 확정 종가로 자동 판정 · 장중 시세는 쓰지 않음</small></h4>
  <ol className="semi-roadmap">{STEP.map((name,i)=>{const d=i<at?done(i):undefined;return <li key={name} className={i===at?'now':i<at?'done':''}>
   <b>{name}{i===at&&<em>지금</em>}{i<at&&<em className="done">지남{d?` · ${d.date}`:''}</em>}</b><span>{detail[i]}</span>
   <small>{rule[i]}{match?` · 교재: ${AUTHOR.scenario[i].when==='지금'?'':AUTHOR.scenario[i].when+' '}${AUTHOR.scenario[i].price}`:''}</small></li>;})}</ol>
  <p className="semi-stage-now"><b>{now}</b> {need}</p>
  <details className="semi-glossary"><summary>같은 규칙을 2016년부터 돌린 기록 {st.events.length}건 · 사이클 기준 {usd(L)}({st.low.date}) → {usd(H)}({st.high.date})</summary>
   <div className="semi-table-scroll"><table className="semi-table">
    <thead><tr><th>확인일</th><th>판정</th><th>확인 종가</th><th>기준</th></tr></thead>
    <tbody>{st.events.map((e,i)=><tr key={i} className={e.kind.endsWith('failed')?'failed':''}><td>{e.date}</td><td>{label(e)}</td><td>{usd(e.price)}</td><td>{basis(e)}</td></tr>)}</tbody>
   </table></div>
   <ul className="semi-notes">
    <li>이 규칙은 교재가 짚은 세 사이클(2016→2018, 2020→2022, 2025→2026 저점·고점)을 그대로 찾아냅니다. 확인 {st.events.filter(e=>!e.kind.endsWith('failed')).length}번 가운데 {st.events.filter(e=>e.kind.endsWith('failed')).length}번은 나중에 되돌려졌습니다.</li>
    <li>확인은 늦습니다. 저점·고점을 맞히는 신호가 아니라 지나간 뒤에 확인하는 표시입니다(예: 2022-10 저점은 2023-01에 확인).</li>
    <li>−{half}% · {STAGE.age}거래일은 교재에 없는 값으로, 20~25% · 10~20거래일 범위에서 같은 결과가 나오는 것을 확인하고 정했습니다. 사례가 세 사이클뿐이라 통계 검증은 아니며, 이 사이트의 매매 신호·자동매매에는 쓰지 않습니다.</li>
   </ul>
  </details>
 </section>;
}

export default function SemiCycle(){
 const [data,setData]=useState<SemiData|null>(null),[error,setError]=useState('');
 const {quote,state}=useLiveQuote(),narrow=useNarrow();
 useEffect(()=>{import('./data.ts').then(d=>d.json<unknown>('/data/live/semis/latest.json')).then(d=>{if(!validSemis(d))throw new Error('bad');setData(d);}).catch(()=>setError('반도체 지수(SOXX) 자료를 아직 불러올 수 없습니다. 다음 미국 자료 수집 뒤 표시됩니다.'));},[]);
 const view=useMemo(()=>{
  if(!data)return null;
  const confirmed=daily(data),merged=withLive(confirmed,quote),bars=merged.bars,weeks=weekly(bars);
  /* Anchors and stage come from confirmed daily closes only; the live quote moves the price, not the stage. */
  const st=stages(confirmed),c=st?cycleFrom(bars,st.low,st.high):cycle(bars);
  if(!c)return null;
  const byWeek=new Map(weeks.map(w=>[weekKey(w.date),w.date]));
  const wk=(date:string)=>byWeek.get(weekKey(date));
  const L=c.low.price,H=c.high.price,last=c.last.price,prev=merged.live&&quote?.prev_close?quote.prev_close:bars.at(-2)?.close??null;
  const fib=[0,...RETRACE,1].map(r=>({r,price:retrace(L,H,r)}));
  const ext=EXTEND.map(k=>({k,price:extend(L,H,k)}));
  const now=depth(L,H,last),deepest=c.lastLow?depth(L,H,c.lastLow.price):null;
  const next=fib.find(f=>f.price<last&&f.r>0);
  let peak=0;const long=weeks.map(w=>{peak=Math.max(peak,w.high);return {date:w.date,close:w.close,dd:w.close/peak-1};});
  const episodes=EPISODES.map(e=>({e,x:episode(bars,e)}));
  const extensions=EXTENSIONS.map(e=>({e,x:extensionCheck(bars,e)}));
  const from=new Date(c.low.date+'T00:00:00Z');from.setUTCMonth(from.getUTCMonth()-4);
  const recent=weeks.filter(w=>w.date>=from.toISOString().slice(0,10)).map(w=>({...w,range:[w.low,w.high] as [number,number]}));
  const conv=convergence(weeks),top=doubleTop(bars,c.high);
  const ws=W_PATTERNS.map(w=>({w,range:windowRange(bars,w.from,w.to)}));
  const pattern=long.filter(r=>r.date>='2016-01-01');
  const e=episodes.map(x=>x.x);
  /* 교재가 인용한 수치를 같은 구간의 자료로 다시 잰 것 */
  const stats=[
   {name:'수렴 돌파 뒤 상승(2013 돌파 → 2018 고점)',author:'약 +200%',value:conv&&e[0]?e[0].high.price/conv.breakout.price-1:null},
   {name:'2018 조정 뒤 W 상승(저점 → 2020 고점)',author:'+90%',value:e[0]&&e[1]?e[1].high.price/e[0].trough.price-1:null},
   {name:'2022 조정 뒤 W 상승(저점 → 2024 고점)',author:'+182%',value:e[2]&&e[3]?e[3].high.price/e[2].trough.price-1:null},
   {name:'이번 사이클 저점 대비 상승',author:'+346%',value:H/L-1},
   {name:'고점 대비 하락(조정 중 최저가 기준)',author:'약 −44%',value:c.lastLow?c.lastLow.price/H-1:null},
   {name:'0.5 저점에서 1.272까지 반등 폭',author:'약 +200%',value:extend(L,H,1.272)/retrace(L,H,0.5)-1},
  ];
  const match=c.low.date===AUTHOR.cycle.low&&c.high.date===AUTHOR.cycle.high;
  return {st,match,conv,top,ws,pattern,stats,isLive:merged.live,c,L,H,last,prev,fib,ext,now,deepest,next,long,episodes,extensions,recent,wk,
   bandTop:retrace(L,H,0.382),bandBottom:retrace(L,H,0.618),target:extend(L,H,1.272)};
 },[data,quote]);
 if(error)return <p className="notice">{error}</p>;
 if(!data)return <div className="chart-empty" role="status">반도체 지수 차트를 불러오는 중…</div>;
 if(!view)return <p className="notice">SOXX 사이클 고점·저점을 찾지 못했습니다.</p>;
 const {c,L,H,last,prev,fib,ext,now,deepest,next,long,episodes,extensions,recent,wk,conv,top,ws,pattern,stats,st,match}=view;
 const quoted=(k:string)=>match?AUTHOR.levels[k]??null:null;
 const dotLabel=(value:string,position:'top'|'bottom'|'left'|'right'='top')=>({value,position,fontSize:10,fill:'var(--text,currentColor)'});
 const longMax=Math.max(1200,ext[1].price*1.2),recentLo=Math.min(retrace(L,H,0.618),...recent.map(r=>r.low))*0.88,recentHi=view.target*1.12;
 const nextBox=AUTHOR.boxes[2].price*AUTHOR.boxRatio;
 // A quote with no trade for 15 minutes is the last regular-session close (market closed), not a live price.
 const fresh=!!quote&&Date.parse(quote.fetched_at)-Date.parse(quote.time)<15*60_000;
 return <div className="semi-cycle">
  <div className="semi-cards">
   <article className={view.isLive?'live':''}><span>{view.isLive&&fresh?'SOXX 현재가':'SOXX 종가'}{view.isLive&&(fresh?<em className="semi-live-dot" aria-label="실시간">실시간</em>:<em className="semi-live-dot closed">장 마감</em>)}</span><b>{usd(last)}</b><small className={prev&&last>=prev?'positive':'negative'}>{prev?pct(last/prev-1,2):''} · {view.isLive&&quote?`${kst(quote.time)} 체결`:c.last.date}</small></article>
   <article><span>사이클 고점 대비</span><b>{pct(last/H-1)}</b><small>고점 {usd(H)} · {c.high.date}</small></article>
   <article><span>지금 위치(로그 되돌림)</span><b>{now.toFixed(3)}</b><small>{zone(now)}{deepest!=null&&` · 최저 ${usd(c.lastLow!.price)}(${c.lastLow!.date.slice(5)}) = ${deepest.toFixed(3)}`}</small></article>
   <article><span>다음 지지 {next?next.r:''}</span><b>{usd(next?.price)}</b><small>{next?`지금보다 ${pct(next.price/last-1)}`:'—'} {match&&next&&quoted(String(next.r))!=null?` · 작성자 ${usd(quoted(String(next.r)))}`:''}</small></article>
   <article className="target"><span>반등 목표 1.272</span><b>{usd(view.target,0)}</b><small>지금보다 {pct(view.target/last-1,0)}{match?' · 작성자 $328':''}</small></article>
  </div>
  <p className={`semi-live-status ${state.kind}`} role="status">{state.kind==='on'&&quote?`${fresh?'실시간 시세':'미국 장 마감 · 직전 정규장 종가'} Finnhub · 마지막 체결 ${kst(quote.time)}(한국시간) · 1분마다 갱신 · 미국 정규장(한국시간 23:30~06:00, 서머타임 때 22:30~05:00) 밖에는 직전 정규장 종가`:state.kind==='off'?`실시간 시세 꺼짐 · ${state.message??''} 하루 한 번 수집한 종가로 보여 줍니다.`:state.kind==='error'?`실시간 시세를 받지 못했습니다(${state.message}). 수집한 종가로 보여 주고 1분 뒤 다시 시도합니다.`:'실시간 시세 확인 중…'}</p>

  {st&&<StagePanel st={st} match={match} L={L} H={H}/>}
  {!match&&<p className="notice">교재({AUTHOR.date})가 다룬 사이클({AUTHOR.cycle.low} 저점 → {AUTHOR.cycle.high} 고점)이 끝나 새 사이클 기준으로 계산합니다. 아래 ‘작성자’ 수치와 교재 요약 글은 지난 사이클 내용입니다.</p>}

  <section className="semi-block" aria-label="SOXX 장기 차트">
   <h4>장기 흐름 <small>주봉 종가 · 로그 눈금 · 2001년~ · 회색 띠 = 작성자가 짚은 조정 구간</small></h4>
   <div className="semi-chart-long"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={long} margin={{top:10,right:narrow?64:104,left:0,bottom:0}}>
    <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 5"/>
    <XAxis dataKey="date" tickFormatter={v=>String(v).slice(0,4)} tick={{fontSize:11,fill:'var(--muted)'}} minTickGap={36}/>
    <YAxis scale="log" domain={[1.5,longMax]} allowDataOverflow ticks={ticksIn(1.5,longMax)} width={44} tick={{fontSize:11,fill:'var(--muted)'}} tickFormatter={v=>`$${v}`}/>
    {episodes.map(({e,x},i)=>x&&wk(x.high.date)&&wk(x.trough.date)?<ReferenceArea key={e.name} x1={wk(x.high.date)} x2={wk(x.trough.date)} fill="var(--semi-episode)" strokeOpacity={0} label={narrow?undefined:{value:`${e.name.slice(0,4)} ${pct(x.drawdown,0)}`,position:'insideTop',offset:i%2?18:4,fontSize:10,fill:'var(--muted)'}}/>:null)}
    {AUTHOR.boxes.map(b=><ReferenceLine key={b.label} y={b.price} stroke="var(--semi-box)" strokeDasharray="4 4" label={{value:narrow?`$${b.price}`:`${b.label.replace(' 박스','')} $${b.price}`,position:'right',fontSize:10,fill:'var(--muted)'}}/>)}
    <ReferenceLine y={nextBox} stroke="var(--semi-box)" strokeDasharray="2 6" label={{value:`다음 ≈$${Math.round(nextBox)}`,position:'right',fontSize:10,fill:'var(--muted)'}}/>
    <ReferenceLine y={ext[0].price} stroke="var(--semi-target)" strokeDasharray="6 3" label={{value:`1.272 $${Math.round(ext[0].price)}`,position:'right',fontSize:10,fill:'var(--semi-target)'}}/>
    <ReferenceLine y={ext[1].price} stroke="var(--semi-target)" strokeDasharray="6 3" label={{value:`2.0 $${Math.round(ext[1].price)}`,position:'right',fontSize:10,fill:'var(--semi-target)'}}/>
    {conv&&<ReferenceLine segment={[{x:conv.from.date,y:conv.from.price},{x:conv.to.date,y:conv.to.price}]} stroke="var(--semi-trend)" strokeWidth={1.4} ifOverflow="hidden"/>}
    <Tooltip content={({active,payload,label})=>{const r=payload?.[0]?.payload as (typeof long)[number]|undefined;if(!active||!r)return null;return <div className="chart-tip"><strong>{label} 주</strong><div>종가 {usd(r.close)}</div><div>전고점 대비 {pct(r.dd)}</div></div>;}}/>
    <Line dataKey="close" name="주봉 종가" stroke="var(--semi-line)" strokeWidth={1.6} dot={false} isAnimationActive={false}/>
    {conv&&<ReferenceDot x={conv.breakout.date} y={conv.breakout.price} r={4} fill="var(--semi-trend)" stroke="var(--surface,#fff)" strokeWidth={2} label={dotLabel(narrow?'돌파':`${conv.breakout.date.slice(0,4)} 수렴 돌파`,'bottom')}/>}
   </ComposedChart></ResponsiveContainer></div>
   <p className="semi-legend"><span><i className="line"/>SOXX 주봉 종가</span><span><i className="trend"/>2001·2011 고점 추세선(수렴){conv?` · ${conv.breakout.date.slice(0,7)} 돌파`:''}</span><span><i className="box"/>작성자 박스 목표(각 단 약 ×{AUTHOR.boxRatio.toFixed(2)})</span><span><i className="target"/>지금 사이클({c.low.date.slice(0,7)} 저점 → {c.high.date.slice(0,7)} 고점) 확장 1.272 · 2.0</span><span><i className="episode"/>조정 구간{narrow?` ${episodes.map(({e,x})=>x?`${e.name.slice(2,4)}년 ${pct(x.drawdown,0)}`:'').filter(Boolean).join(' · ')}`:''}</span></p>
  </section>

  <section className="semi-block" aria-label="반복되는 패턴">
   <h4>반복되는 패턴 <small>주봉 종가 · 로그 눈금 · 2016년~ · W(쌍바닥) · 1.272에서 막힌 반등 · 쌍봉과 넥라인 — 작성자가 짚은 자리를 자료에서 다시 찾아 표시</small></h4>
   <div className="semi-chart-long"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={pattern} margin={{top:18,right:narrow?64:104,left:0,bottom:0}}>
    <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 5"/>
    <XAxis dataKey="date" tickFormatter={v=>String(v).slice(0,4)} tick={{fontSize:11,fill:'var(--muted)'}} minTickGap={36}/>
    <YAxis scale="log" domain={[7,300]} allowDataOverflow ticks={ticksIn(7,300,true)} width={44} tick={{fontSize:11,fill:'var(--muted)'}} tickFormatter={v=>`$${v}`}/>
    {ws.map(({w,range})=>range&&wk(w.from)&&wk(w.to)?<ReferenceArea key={w.name} x1={wk(w.from)} x2={wk(w.to)} y1={range.low*0.96} y2={range.high*1.04} fill="var(--semi-w)" stroke="var(--semi-w-line)" strokeDasharray="4 3" label={{value:narrow?'W':w.name,position:'insideTopLeft',fontSize:10,fill:'var(--semi-w-line)'}}/>:null)}
    {AUTHOR.boxes.map(b=><ReferenceLine key={b.label} y={b.price} stroke="var(--semi-box)" strokeDasharray="4 4" label={{value:narrow?`$${b.price}`:`${b.label.replace(' 박스','')} $${b.price}`,position:'right',fontSize:10,fill:'var(--muted)'}}/>)}
    {top?.broken&&wk(top.first.date)&&<ReferenceLine segment={[{x:wk(top.first.date)!,y:top.neck.price},{x:pattern.at(-1)!.date,y:top.neck.price}]} stroke="var(--semi-target)" strokeWidth={1.4} ifOverflow="hidden"/>}
    <Tooltip content={({active,payload,label})=>{const r=payload?.[0]?.payload as (typeof long)[number]|undefined;if(!active||!r)return null;return <div className="chart-tip"><strong>{label} 주</strong><div>종가 {usd(r.close)}</div><div>전고점 대비 {pct(r.dd)}</div></div>;}}/>
    <Line dataKey="close" name="주봉 종가" stroke="var(--semi-line)" strokeWidth={1.6} dot={false} isAnimationActive={false}/>
    {episodes[1].x&&wk(episodes[1].x.trough.date)&&<ReferenceDot x={wk(episodes[1].x.trough.date)} y={episodes[1].x.trough.price} r={4} fill="var(--semi-fib)" stroke="var(--surface,#fff)" strokeWidth={2} label={dotLabel(narrow?'지지':`17.9 지지 ${usd(episodes[1].x.trough.price,1)}`,'bottom')}/>}
    {[episodes[1].x,episodes[3].x].map((x,i)=>x&&wk(x.high.date)?<ReferenceDot key={i} x={wk(x.high.date)} y={x.high.price} r={4} fill="var(--semi-target)" stroke="var(--surface,#fff)" strokeWidth={2} label={dotLabel(narrow?'1.272':`1.272에서 반등 끝 ${usd(x.high.price,0)}`,'top')}/>:null)}
    {top?.broken&&[top.first,top.second].map((t,i)=>wk(t.date)?<ReferenceDot key={`t${i}`} x={wk(t.date)} y={t.price} r={4} fill="var(--semi-up)" stroke="var(--surface,#fff)" strokeWidth={2} label={i===0?dotLabel('쌍봉','top'):undefined}/>:null)}
   </ComposedChart></ResponsiveContainer></div>
   <p className="semi-legend"><span><i className="w"/>W 패턴(작성자 표시 구간)</span><span><i className="dot fib"/>2020 코로나 저점 {usd(episodes[1].x?.trough.price,1)}(1단 박스 17.9 지지)</span><span><i className="dot target"/>1.272에서 끝난 반등(2020 {usd(episodes[1].x?.high.price,0)} · 2024 {usd(episodes[3].x?.high.price,0)})</span>{top?.broken&&<><span><i className="dot up"/>쌍봉 {top.first.date.slice(2,7)} {usd(top.first.price,0)} · {top.second.date.slice(2,7)} {usd(top.second.price,0)}</span><span><i className="target solid"/>넥라인 {usd(top.neck.price,0)} — {top.broken.date} 종가로 붕괴</span></>}</p>
   <div className="semi-table-scroll"><table className="semi-table">
    <thead><tr><th>교재가 인용한 수치</th><th>작성자</th><th>자료 계산</th></tr></thead>
    <tbody>{stats.map(x=><tr key={x.name}><td>{x.name}</td><td>{x.author}</td><td><b>{pct(x.value,0)}</b></td></tr>)}</tbody>
   </table></div>
  </section>

  <section className="semi-block" aria-label="지금 사이클 되돌림">
   <h4>지금 사이클 되돌림 <small>주봉 · 로그 눈금 · 저점 {usd(L)}({c.low.date}) → 고점 {usd(H)}({c.high.date}) · 파란 띠 = 0.382~0.618 분할 매수 구간(작성자)</small></h4>
   <div className="semi-chart-cycle"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={recent} margin={{top:10,right:narrow?74:96,left:0,bottom:0}}>
    <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 5"/>
    <XAxis dataKey="date" tickFormatter={v=>String(v).slice(2,7).replace('-','.')} tick={{fontSize:11,fill:'var(--muted)'}} minTickGap={28}/>
    <YAxis scale="log" domain={[recentLo,recentHi]} allowDataOverflow ticks={ticksIn(recentLo,recentHi,true)} width={44} tick={{fontSize:11,fill:'var(--muted)'}} tickFormatter={v=>`$${v}`}/>
    <ReferenceArea y1={view.bandBottom} y2={view.bandTop} fill="var(--semi-band)" strokeOpacity={0}/>
    {fib.map(f=><ReferenceLine key={f.r} y={f.price} stroke={f.r===0||f.r===1?'var(--muted)':'var(--semi-fib)'} strokeOpacity={f.r===0.236?0.5:0.9} strokeDasharray={f.r===0||f.r===1?'0':'4 3'} label={{value:`${f.r} $${f.price.toFixed(1)}`,position:'right',fontSize:10,fill:f.r===0||f.r===1?'var(--muted)':'var(--semi-fib)'}}/>)}
    <ReferenceLine y={ext[0].price} stroke="var(--semi-target)" strokeDasharray="6 3" label={{value:`1.272 $${ext[0].price.toFixed(0)}`,position:'right',fontSize:10,fill:'var(--semi-target)'}}/>
    <Tooltip content={({active,payload,label})=>{const r=payload?.[0]?.payload as (typeof recent)[number]|undefined;if(!active||!r)return null;return <div className="chart-tip"><strong>{label} 주</strong><div>시가 {usd(r.open)} · 고가 {usd(r.high)}</div><div>저가 {usd(r.low)} · 종가 {usd(r.close)}</div><div>종가 되돌림 {depth(L,H,r.close).toFixed(3)}</div></div>;}}/>
    <Bar dataKey="range" name="주봉" shape={<LogCandle/>} isAnimationActive={false}/>
   </ComposedChart></ResponsiveContainer></div>
   <div className="semi-table-scroll"><table className="semi-table">
    <thead><tr><th>되돌림</th><th>자료 계산</th><th>작성자</th><th>지금 가격 대비</th><th>지금 상태(자료)</th><th>작성자 해석</th></tr></thead>
    <tbody>{fib.filter(f=>f.r>0&&f.r<1).map(f=><tr key={f.r} className={deepest!=null&&deepest>=f.r?'reached':''}><td>{f.r}</td><td>{usd(f.price)}</td><td>{usd(quoted(String(f.r)))}</td><td>{pct(f.price/last-1)}</td><td>{last<f.price?'지금 가격이 아래(이탈)':deepest!=null&&deepest>=f.r&&c.lastLow?`${c.lastLow.date.slice(5)} 저가 ${usd(c.lastLow.price,1)}로 닿음`:'아직 닿지 않음'}</td><td>{f.r===0.236?'2018년에는 여기서 멈춤':f.r===0.382?'1차 매수':f.r===0.5?'가장 유력한 저점 · 2차 매수':'블랙스완 때 · 3차 매수'}</td></tr>)}
    {ext.map(x=><tr key={x.k} className="ext"><td>확장 {x.k}</td><td>{usd(x.price,0)}</td><td>{usd(quoted(x.k===2?'2':'1.272'),0)}</td><td>{pct(x.price/last-1,0)}</td><td>{last>=x.price?'도달':'아직 닿지 않음'}</td><td>{x.k===2?'2029~ 상승장 목표(900달러대)':'반등장 끝 · 전량 매도 자리'}</td></tr>)}</tbody>
   </table></div>
  </section>

  <section className="semi-block" aria-label="사이클별 배경">
   <h4>사이클을 이끈 배경 <small>교재 요약 · 박스 한 단은 로그 차트에서 약 200%(×{AUTHOR.boxRatio.toFixed(2)})</small></h4>
   <div className="semi-story">{STORY.cycles.map(x=><article key={x.period}><span>{x.period}</span><b>{x.title}</b><em>{x.box}</em><ul>{x.points.map(p=><li key={p}>{p}</li>)}</ul><small>{x.end}</small></article>)}</div>
   <div className="semi-rules"><strong>조정이 멈추는 자리(작성자의 P·Q 규칙)</strong>
    <ul>{AUTHOR.rules.map(r=><li key={r.when}><span>{r.when}</span><b>{r.range}</b></li>)}</ul></div>
   <div className="semi-explain">
    <div><strong>지금 조정을 보는 작성자의 시각({AUTHOR.date} 기준)</strong><ul>{STORY.now.map(x=><li key={x}>{x}</li>)}</ul></div>
    <div><strong>1.272가 왜 중요한가</strong><ul>{STORY.why1272.map(x=><li key={x}>{x}</li>)}</ul><strong>328달러를 기억해야 하는 이유</strong><ul>{STORY.why328.map(x=><li key={x}>{x}</li>)}</ul></div>
   </div>
   <details className="semi-glossary"><summary>용어 풀이 {STORY.glossary.length}개</summary><dl>{STORY.glossary.map(([t,d])=><div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}</dl></details>
  </section>

  <section className="semi-block" aria-label="과거 조정 검증">
   <h4>과거 조정, 자료로 다시 재 보기 <small>Yahoo 분할 조정 일봉 · 각 구간 직전 사이클 저점 → 고점 → 조정 저점 · 로그 되돌림</small></h4>
   <div className="semi-table-scroll"><table className="semi-table">
    <thead><tr><th>구간</th><th>성격(작성자)</th><th>사이클 저점</th><th>고점</th><th>조정 저점</th><th>고점 대비</th><th>되돌림(자료)</th><th>작성자</th></tr></thead>
    <tbody>{episodes.map(({e,x})=>x?<tr key={e.name}><td>{e.name}</td><td>{e.why}</td><td>{usd(x.low.price)}<small>{x.low.date}</small></td><td>{usd(x.high.price)}<small>{x.high.date}</small></td><td>{usd(x.trough.price)}<small>{x.trough.date}</small></td><td className="negative">{pct(x.drawdown)}</td><td><b>{x.depth.toFixed(3)}</b></td><td>{e.author}</td></tr>:<tr key={e.name}><td>{e.name}</td><td colSpan={7}>자료 부족</td></tr>)}</tbody>
   </table></div>
   <div className="semi-table-scroll"><table className="semi-table">
    <thead><tr><th>확장 확인</th><th>레벨</th><th>자료 계산</th><th>작성자</th><th>실제 고점</th><th>차이</th></tr></thead>
    <tbody>{extensions.map(({e,x})=>x?<tr key={e.name}><td>{e.name}</td><td>{e.k}</td><td>{usd(x.level)}</td><td>{e.author==null?'—':usd(e.author,0)}</td><td>{usd(x.actual.price)}<small>{x.actual.date}</small></td><td>{pct(x.gap)}</td></tr>:null)}</tbody>
   </table></div>
   <ul className="semi-notes">
    <li>지금 사이클 레벨(0.382·0.5·0.618·1.272·2.0)은 작성자 수치와 1% 안에서 맞습니다. 작성자도 로그 눈금으로 그은 것으로 보입니다.</li>
    <li>과거 조정은 자료로 재면 작성자가 짚은 레벨보다 0.05~0.15 더 깊었습니다(예: 2020년 0.618 → 자료 {episodes[1].x?.depth.toFixed(2)??'—'}). 고점·저점을 어디로 잡느냐에 따라 값이 달라지므로 레벨은 ‘정확한 가격’이 아니라 ‘구간’으로 보는 것이 맞습니다.</li>
    <li>확장 1.272·2.0 은 네 번 모두 실제 고점이 계산 레벨보다 3~8% 위에서 났습니다. 다만 사례가 4번뿐이고 레벨을 정한 뒤에 맞춰 본 것이라 통계 검증은 아닙니다.</li>
    <li>가격은 분할만 조정한 값(배당 미포함)으로, TradingView 같은 일반 가격 차트와 같은 기준입니다. 지금 사이클은 최근 3년 최고가와 그 전 18개월 최저가로 자동으로 잡으며, 새 고점이 나오면 레벨도 따라 바뀝니다.</li>
   </ul>
  </section>
  <p className="source-note">SOXX(iShares Semiconductor ETF) · {data.source} · 기준일 {data.as_of}(미국 현지 거래일) · 로그 피보나치: 되돌림 = 고점 × (저점/고점)^r, 확장 = 저점 × (고점/저점)^k · 작성자 수치와 시나리오는 {AUTHOR.source}({AUTHOR.date})를 요약 · 투자 권유 아님</p>
 </div>;
}
