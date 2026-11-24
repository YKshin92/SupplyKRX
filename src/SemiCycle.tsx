import {useEffect,useMemo,useState} from 'react';
import {ResponsiveContainer,ComposedChart,Line,Bar,XAxis,YAxis,Tooltip,CartesianGrid,ReferenceLine,ReferenceArea} from 'recharts';
import {AUTHOR,EPISODES,EXTEND,EXTENSIONS,RETRACE,cycle,daily,depth,episode,extend,extensionCheck,retrace,validSemis,weekKey,weekly,withLive,zone,type Bar as Ohlc,type Live,type SemiData} from './semis';
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

export default function SemiCycle(){
 const [data,setData]=useState<SemiData|null>(null),[error,setError]=useState('');
 const {quote,state}=useLiveQuote();
 useEffect(()=>{import('./data.ts').then(d=>d.json<unknown>('/data/live/semis/latest.json')).then(d=>{if(!validSemis(d))throw new Error('bad');setData(d);}).catch(()=>setError('반도체 지수(SOXX) 자료를 아직 불러올 수 없습니다. 다음 미국 자료 수집 뒤 표시됩니다.'));},[]);
 const view=useMemo(()=>{
  if(!data)return null;
  const merged=withLive(daily(data),quote),bars=merged.bars,weeks=weekly(bars),c=cycle(bars);
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
  return {isLive:merged.live,c,L,H,last,prev,fib,ext,now,deepest,next,long,episodes,extensions,recent,wk,
   bandTop:retrace(L,H,0.382),bandBottom:retrace(L,H,0.618),target:extend(L,H,1.272)};
 },[data,quote]);
 if(error)return <p className="notice">{error}</p>;
 if(!data)return <div className="chart-empty" role="status">반도체 지수 차트를 불러오는 중…</div>;
 if(!view)return <p className="notice">SOXX 사이클 고점·저점을 찾지 못했습니다.</p>;
 const {c,L,H,last,prev,fib,ext,now,deepest,next,long,episodes,extensions,recent,wk}=view;
 const longMax=Math.max(1200,ext[1].price*1.2),recentLo=Math.min(retrace(L,H,0.618),...recent.map(r=>r.low))*0.88,recentHi=view.target*1.12;
 const nextBox=AUTHOR.boxes[2].price*AUTHOR.boxRatio;
 // A quote with no trade for 15 minutes is the last regular-session close (market closed), not a live price.
 const fresh=!!quote&&Date.parse(quote.fetched_at)-Date.parse(quote.time)<15*60_000;
 return <div className="semi-cycle">
  <div className="semi-cards">
   <article className={view.isLive?'live':''}><span>{view.isLive&&fresh?'SOXX 현재가':'SOXX 종가'}{view.isLive&&(fresh?<em className="semi-live-dot" aria-label="실시간">실시간</em>:<em className="semi-live-dot closed">장 마감</em>)}</span><b>{usd(last)}</b><small className={prev&&last>=prev?'positive':'negative'}>{prev?pct(last/prev-1,2):''} · {view.isLive&&quote?`${kst(quote.time)} 체결`:c.last.date}</small></article>
   <article><span>사이클 고점 대비</span><b>{pct(last/H-1)}</b><small>고점 {usd(H)} · {c.high.date}</small></article>
   <article><span>지금 위치(로그 되돌림)</span><b>{now.toFixed(3)}</b><small>{zone(now)}{deepest!=null&&` · 최저 ${usd(c.lastLow!.price)}(${c.lastLow!.date.slice(5)}) = ${deepest.toFixed(3)}`}</small></article>
   <article><span>다음 지지 {next?next.r:''}</span><b>{usd(next?.price)}</b><small>{next?`지금보다 ${pct(next.price/last-1)}`:'—'} · 작성자 {next?usd(AUTHOR.levels[String(next.r)]??null):'—'}</small></article>
   <article className="target"><span>반등 목표 1.272</span><b>{usd(view.target,0)}</b><small>지금보다 {pct(view.target/last-1,0)} · 작성자 $328</small></article>
  </div>
  <p className={`semi-live-status ${state.kind}`} role="status">{state.kind==='on'&&quote?`${fresh?'실시간 시세':'미국 장 마감 · 직전 정규장 종가'} Finnhub · 마지막 체결 ${kst(quote.time)}(한국시간) · 1분마다 갱신 · 미국 정규장(한국시간 23:30~06:00, 서머타임 때 22:30~05:00) 밖에는 직전 정규장 종가`:state.kind==='off'?`실시간 시세 꺼짐 · ${state.message??''} 하루 한 번 수집한 종가로 보여 줍니다.`:state.kind==='error'?`실시간 시세를 받지 못했습니다(${state.message}). 수집한 종가로 보여 주고 1분 뒤 다시 시도합니다.`:'실시간 시세 확인 중…'}</p>

  <section className="semi-block" aria-label="SOXX 장기 차트">
   <h4>장기 흐름 <small>주봉 종가 · 로그 눈금 · 2001년~ · 회색 띠 = 작성자가 짚은 조정 구간</small></h4>
   <div className="semi-chart-long"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={long} margin={{top:10,right:104,left:0,bottom:0}}>
    <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 5"/>
    <XAxis dataKey="date" tickFormatter={v=>String(v).slice(0,4)} tick={{fontSize:11,fill:'var(--muted)'}} minTickGap={36}/>
    <YAxis scale="log" domain={[1.5,longMax]} allowDataOverflow ticks={ticksIn(1.5,longMax)} width={44} tick={{fontSize:11,fill:'var(--muted)'}} tickFormatter={v=>`$${v}`}/>
    {episodes.map(({e,x})=>x&&wk(x.high.date)&&wk(x.trough.date)?<ReferenceArea key={e.name} x1={wk(x.high.date)} x2={wk(x.trough.date)} fill="var(--semi-episode)" strokeOpacity={0} label={{value:`${e.name.slice(0,4)} ${pct(x.drawdown,0)}`,position:'insideTop',fontSize:10,fill:'var(--muted)'}}/>:null)}
    {AUTHOR.boxes.map(b=><ReferenceLine key={b.label} y={b.price} stroke="var(--semi-box)" strokeDasharray="4 4" label={{value:`${b.label.replace(' 박스','')} $${b.price}`,position:'right',fontSize:10,fill:'var(--muted)'}}/>)}
    <ReferenceLine y={nextBox} stroke="var(--semi-box)" strokeDasharray="2 6" label={{value:`다음 ≈$${Math.round(nextBox)}`,position:'right',fontSize:10,fill:'var(--muted)'}}/>
    <ReferenceLine y={ext[0].price} stroke="var(--semi-target)" strokeDasharray="6 3" label={{value:`1.272 $${Math.round(ext[0].price)}`,position:'right',fontSize:10,fill:'var(--semi-target)'}}/>
    <ReferenceLine y={ext[1].price} stroke="var(--semi-target)" strokeDasharray="6 3" label={{value:`2.0 $${Math.round(ext[1].price)}`,position:'right',fontSize:10,fill:'var(--semi-target)'}}/>
    <Tooltip content={({active,payload,label})=>{const r=payload?.[0]?.payload as (typeof long)[number]|undefined;if(!active||!r)return null;return <div className="chart-tip"><strong>{label} 주</strong><div>종가 {usd(r.close)}</div><div>전고점 대비 {pct(r.dd)}</div></div>;}}/>
    <Line dataKey="close" name="주봉 종가" stroke="var(--semi-line)" strokeWidth={1.6} dot={false} isAnimationActive={false}/>
   </ComposedChart></ResponsiveContainer></div>
   <p className="semi-legend"><i className="line"/>SOXX 주봉 종가 <i className="box"/>작성자 박스 목표(각 단 약 ×{AUTHOR.boxRatio.toFixed(2)}) <i className="target"/>지금 사이클({c.low.date.slice(0,7)} 저점 → {c.high.date.slice(0,7)} 고점) 확장 1.272 · 2.0 <i className="episode"/>조정 구간</p>
  </section>

  <section className="semi-block" aria-label="지금 사이클 되돌림">
   <h4>지금 사이클 되돌림 <small>주봉 · 로그 눈금 · 저점 {usd(L)}({c.low.date}) → 고점 {usd(H)}({c.high.date}) · 파란 띠 = 0.382~0.618 분할 매수 구간(작성자)</small></h4>
   <div className="semi-chart-cycle"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={recent} margin={{top:10,right:96,left:0,bottom:0}}>
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
    <thead><tr><th>되돌림</th><th>자료 계산</th><th>작성자</th><th>지금 종가 대비</th><th>작성자 해석</th></tr></thead>
    <tbody>{fib.filter(f=>f.r>0&&f.r<1).map(f=><tr key={f.r} className={deepest!=null&&deepest>=f.r?'reached':''}><td>{f.r}</td><td>{usd(f.price)}</td><td>{AUTHOR.levels[String(f.r)]?usd(AUTHOR.levels[String(f.r)]):'—'}</td><td>{pct(f.price/last-1)}</td><td>{f.r===0.236?'이미 깨짐':f.r===0.382?'11월 셋째 주에 닿음 · 1차 매수':f.r===0.5?'가장 유력한 저점 · 2차 매수':'블랙스완 때 · 3차 매수'}</td></tr>)}
    {ext.map(x=><tr key={x.k} className="ext"><td>확장 {x.k}</td><td>{usd(x.price,0)}</td><td>{usd(AUTHOR.levels[x.k===2?'2':'1.272'],0)}</td><td>{pct(x.price/last-1,0)}</td><td>{x.k===2?'2029~ 상승장 목표(900달러대)':'반등장 끝 · 전량 매도 자리'}</td></tr>)}</tbody>
   </table></div>
  </section>

  <section className="semi-block" aria-label="작성자 시나리오">
   <h4>작성자 시나리오 <small>{AUTHOR.source} · 작성자 견해 요약이며 이 사이트의 예측·투자 권유가 아닙니다</small></h4>
   <ol className="semi-roadmap">{AUTHOR.scenario.map((s,i)=><li key={s.step} className={i===0?'now':''}><b>{s.step}</b><span>{s.when} · {s.price}</span><small>{s.note}</small></li>)}</ol>
   <div className="semi-rules"><strong>조정이 멈추는 자리(작성자의 P·Q 규칙)</strong>
    <ul>{AUTHOR.rules.map(r=><li key={r.when}><span>{r.when}</span><b>{r.range}</b></li>)}</ul></div>
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
