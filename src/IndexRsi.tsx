import {Fragment,Suspense,lazy,useEffect,useMemo,useState,type ReactNode} from 'react';
import {ResponsiveContainer,ComposedChart,Bar,XAxis,YAxis,Tooltip,CartesianGrid} from 'recharts';
import {Candle} from './ChartPrimitives';
import VolumeChart from './VolumeChart';
import RsiStockDetail from './RsiStockDetail';
import RsiChart,{zoneEntries} from './RsiChart';
import RsiSpark from './RsiSpark';
import {readRsi,stateLabel,reasonLabel,unsettled,type RsiData,type RsiIndex,type RsiSummary,type RsiPoint} from './rsi-data';
import {INDEX_PROXY,liveView,type LiveView,type MultiQuote} from './us-live';
import type {Live} from './semis';
import {type Dataset,type Stock,integer,sign} from './data';
import {priceChange,percentLabel} from './price-change';
import {STAT_INVESTORS,type InvestorDatasets} from './MarketFlow';
import './rsi.css';

export type Region='kr'|'us'|'semi';
const SemiCycle=lazy(()=>import('./SemiCycle'));
const fmt=(v:number|null|undefined,d=1)=>v==null?'—':v.toFixed(d);
const krCap=(v:number)=>v>=1e12?`${(v/1e12).toFixed(1)}조`:`${Math.round(v/1e8).toLocaleString('ko-KR')}억`;
const usCap=(v:number|null)=>v==null?'—':v>=1e12?`$${(v/1e12).toFixed(2)}T`:`$${(v/1e9).toFixed(0)}B`;
const points=(v:number|null|undefined)=>v==null?'—':v.toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2});
const pct=(v:number|null)=>v==null?'':`${v>0?'+':v<0?'−':''}${Math.abs(v).toFixed(2)}%`;
/** Table cell amount: +1,234억 / −0.4억 / +1.25조. */
const flowAmount=(n:number|null|undefined)=>{if(n==null)return '—';const a=Math.abs(n),s=n>0?'+':n<0?'−':'';return a>=1e12?`${s}${(a/1e12).toFixed(2)}조`:`${s}${(a<1e9?(a/1e8).toFixed(1):Math.round(a/1e8).toLocaleString('ko-KR'))}억`;};

function ZoneDates({series}:{series:RsiPoint[]}){
 const z=zoneEntries(series);
 const chips=(days:string[],cls:string)=>days.length?days.map(d=><span key={d} className={`rsi-chip ${cls}`}>{d.slice(5)}</span>):<span className="rsi-muted">없음</span>;
 return <div className="rsi-zone-dates">
  <div><b className="low">30 미만 진입일</b>{chips(z.low,'low')}<small>구간 내 {z.lowDays}일</small></div>
  <div><b className="high">70 이상 진입일</b>{chips(z.high,'high')}<small>구간 내 {z.highDays}일</small></div>
 </div>;
}

const Y=62;
const kstTime=(iso:string)=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso));
const fresh=(q:Live)=>Date.parse(q.fetched_at)-Date.parse(q.time)<15*60_000;
function LiveDot({fresh}:{fresh:boolean}){return <i className={`live-dot ${fresh?'on':'closed'}`} aria-hidden="true"/>;}
function LiveTag({live}:{live:LiveView}){return <em className={`live-tag ${live.fresh?'on':'closed'}`}>{live.fresh?'실시간':'장 마감'}</em>;}
type UsLive={quotes:Record<string,Live>;missing:Record<string,string>;state:'loading'|'on'|'off'|'error';message?:string};
/** 미국 시세: polls /api/quote once a minute for the two indices (or their ETFs when the key cannot quote indices) and the top list. */
function useUsLive(enabled:boolean,symbols:string[]):UsLive{
 const [v,setV]=useState<UsLive>({quotes:{},missing:{},state:'loading'});
 const [proxy,setProxy]=useState<Record<string,boolean>>({});
 const key=symbols.join(',');
 useEffect(()=>{
  if(!enabled||!key)return;
  let stop=false,timer:ReturnType<typeof setTimeout>|undefined;
  const list=()=>key.split(',').map(s=>proxy[s]&&INDEX_PROXY[s]?INDEX_PROXY[s]:s);
  const tick=async()=>{
   if(stop)return;
   if(document.visibilityState==='visible'){
    try{
     const r=await fetch(`/api/quote?symbols=${encodeURIComponent(list().join(','))}`,{cache:'no-store',credentials:'same-origin'});
     const body=await r.json().catch(()=>({}));
     if(r.ok){
      const m=body as MultiQuote;
      setV(prev=>({quotes:{...prev.quotes,...m.quotes},missing:m.missing,state:'on'}));
      const blocked=Object.keys(INDEX_PROXY).filter(s=>m.missing?.[s]==='no_access');
      if(blocked.length&&!blocked.every(s=>proxy[s])){setProxy(p=>({...p,...Object.fromEntries(blocked.map(s=>[s,true]))}));return;}
     }else if(body?.error==='not_configured'){setV(p=>({...p,state:'off',message:body.message}));return;}
     else setV(p=>({...p,state:'error',message:body?.message??`시세 응답 오류(${r.status})`}));
    }catch{setV(p=>({...p,state:'error',message:'시세 서버에 연결하지 못했습니다.'}));}
   }
   if(!stop)timer=setTimeout(tick,60_000);
  };
  void tick();
  const wake=()=>{if(document.visibilityState==='visible'){clearTimeout(timer);void tick();}};
  document.addEventListener('visibilitychange',wake);
  return ()=>{stop=true;clearTimeout(timer);document.removeEventListener('visibilitychange',wake);};
 },[enabled,key,proxy]);
 return v;
}
/** One index: daily candles, volume and Wilder RSI(14) on one shared date axis (about 6 months). */
function IndexChart({name,x,live,proxy}:{name:string;x?:RsiIndex;live?:LiveView|null;proxy?:{symbol:string;quote:Live}|null}){
 const series=x?.series??[];
 const data=useMemo(()=>series.map((r,i)=>({...r,wick:r.low!=null&&r.high!=null?[r.low,r.high]:null,previousClose:series[i-1]?.close??null})),[series]);
 if(!x)return <article className="index-chart-card"><strong>{name}</strong><p className="notice">지수 자료 없음</p></article>;
 const s=x.summary,last=series.at(-1),prev=series.at(-2);
 const change=last?.close!=null&&prev?.close?(last.close/prev.close-1)*100:null;
 const sync=`index-${name}`;
 const months=series.length?`${series[0].date} ~ ${last!.date} · ${series.length}거래일`:'';
 return <article className={`index-chart-card ${(live&&live.rsi!=null?live.state:s.state)??''}`} aria-label={`${name} 일봉·거래량·RSI`}>
  <div className="index-chart-head">
   {live?<div><strong>{name}</strong><LiveTag live={live}/><span className="index-chart-close">{points(live.price)}</span><span className={`index-chart-change ${sign(live.change_pct)}`}>{pct(live.change_pct)}</span><small>{live.fresh?'장중':'장 마감 · 수집 전'} {kstTime(live.time)} 체결(한국시간) · 차트는 {last?.date??'—'} 일봉까지</small></div>
    :<div><strong>{name}</strong><span className="index-chart-close">{points(last?.close)}</span><span className={`index-chart-change ${sign(change)}`}>{pct(change)}</span><small>{months}</small>{proxy&&<small className="live-proxy"><LiveDot fresh={fresh(proxy.quote)}/>{proxy.symbol}(지수 추종 ETF) {fresh(proxy.quote)?'장중':'장 마감'} <b className={sign(proxy.quote.change_pct)}>{pct(proxy.quote.change_pct)}</b> · {kstTime(proxy.quote.time)} 체결 · 지수 실시간 시세는 무료 키로 받을 수 없어 ETF로 대신 보여 줍니다</small>}</div>}
   {live&&live.rsi!=null?<div className="index-chart-rsi"><span>장중 RSI(14) · 잠정</span><b>{fmt(live.rsi)}</b><em className={`rsi-state ${live.state??''}`}>{stateLabel(live.state)}</em>{live.entry&&<span className="rsi-event">30 하향 진입(잠정)</span>}<small>전일 확정 {fmt(s.rsi)} · 장 마감 뒤 수집 때 확정</small></div>
    :<div className="index-chart-rsi"><span>RSI(14)</span><b>{fmt(s.rsi)}</b><em className={`rsi-state ${s.state??''}`}>{stateLabel(s.state)}</em>{s.entry_today&&<span className="rsi-event">오늘 30 하향 진입</span>}<small>전일 {fmt(s.prev_rsi)} · Cutler 참고 {fmt(s.cutler)}{unsettled(s)?' · 안정화 전':''}</small></div>}
  </div>
  <h5>일봉</h5>
  <div className="index-chart-price"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} syncId={sync} margin={{top:8,right:10,left:0,bottom:0}}>
   <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 5"/>
   <XAxis dataKey="date" tickFormatter={v=>String(v).slice(5)} tick={{fontSize:11,fill:'var(--muted)'}} minTickGap={24}/>
   <YAxis domain={['auto','auto']} width={Y} tick={{fontSize:11,fill:'var(--muted)'}} tickFormatter={v=>Number(v).toLocaleString('ko-KR',{maximumFractionDigits:0})}/>
   <Tooltip content={({active,payload,label})=>{const r=payload?.[0]?.payload as (typeof data)[number]|undefined;if(!active||!r)return null;return <div className="chart-tip"><strong>{label}</strong>{(['open','high','low','close'] as const).map((key,i)=>{const change=priceChange(r[key],r.previousClose);return <div key={key}>{['시가','고가','저가','종가'][i]}: {points(r[key])} <span className={sign(change)}>({percentLabel(change)})</span></div>;})}<div>거래량: {r.volume==null?'—':`${integer(r.volume)}주`}</div><div>RSI: {r.rsi==null?'—':r.rsi.toFixed(1)}</div><small>전 거래일 종가 대비</small></div>;}}/>
   <Bar dataKey="wick" name="일봉" shape={<Candle/>} isAnimationActive={false}/>
  </ComposedChart></ResponsiveContainer></div>
  <h5>거래량</h5>
  <div className="index-chart-volume">{data.some(r=>r.volume!=null)?<VolumeChart data={data} syncId={sync} yWidth={Y} margin={{left:0,right:10}}/>:<p className="micro-warning">지수 거래량은 다음 수집부터 표시됩니다</p>}</div>
  <h5>RSI(14) <small>Wilder · 30 미만 파랑 · 70 이상 빨강</small></h5>
  <div className="index-chart-rsi-line"><RsiChart series={series} syncId={sync} yWidth={Y}/></div>
  <ZoneDates series={series}/>
 </article>;
}

type Period='1'|'5'|'20';
type FlowCol={key:string;label:string;stocks:Map<string,Stock>|null;status:string};
type Row=RsiSummary&{rank:number;key:string;name:string;sub:string;cap:string;close:string;series:RsiPoint[];live?:LiveView|null};
function TopTable({title,note,rows,currency,flows,period,onPeriod,flowNote}:{title:string;note:string;rows:Row[];currency:'KRW'|'USD';flows?:FlowCol[];period?:Period;onPeriod?:(p:Period)=>void;flowNote?:string}){
 const [open,setOpen]=useState<string|null>(null);
 const value=(s:Stock|undefined)=>!s?null:period==='5'?s.sum5:period==='20'?s.sum20:s.net;
 const cols=9+(flows?.length??0);
 return <div className="rsi-top">
  <div className="rsi-top-title"><h4>{title}</h4><span>{note} · 종목을 누르면 일봉·거래량·RSI 차트가 열립니다</span></div>
  {flows&&onPeriod&&<div className="top-flow-controls"><span>투자자별 순매수 대금</span><div className="rsi-region" role="group" aria-label="순매수 기간">{([['1','최근일'],['5','5일 합'],['20','20일 합']] as const).map(([k,l])=><button key={k} type="button" aria-pressed={period===k} onClick={()=>onPeriod(k)}>{l}</button>)}</div>{flowNote&&<small>{flowNote}</small>}</div>}
  <div className="lab-scroll"><table className="rsi-top-table"><thead><tr><th>순위</th><th>종목</th><th>시가총액</th><th>{rows.some(r=>r.live)?'현재가':'종가'}</th>{flows?.map(f=><th key={f.key} className="flow-col" title={f.status||undefined}>{f.label}</th>)}<th>RSI</th><th>전일</th><th>Cutler 참고</th><th>상태</th><th>최근 흐름</th></tr></thead>
  <tbody>{rows.map(r=><Fragment key={r.key}><tr className={`${(r.live&&r.live.rsi!=null?r.live.state:r.state)??''}${open===r.key?' open':''}`} tabIndex={0} aria-expanded={open===r.key} onClick={()=>setOpen(open===r.key?null:r.key)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();setOpen(open===r.key?null:r.key);}}}><td>{r.rank}</td><td><strong>{r.name}</strong><small>{r.sub}</small></td><td>{r.cap}</td><td>{r.live?<span className="live-price"><LiveDot fresh={r.live.fresh}/>${r.live.price.toFixed(2)}<small className={sign(r.live.change_pct)}>{pct(r.live.change_pct)}</small></span>:r.close}</td>
   {flows?.map(f=>{const v=f.stocks?value(f.stocks.get(r.key)):null;return <td key={f.key} className={`flow-col ${sign(v)}`}>{f.stocks?flowAmount(v):<span className="rsi-muted">…</span>}</td>;})}
   {r.live&&r.live.rsi!=null?<><td className="rsi-num">{fmt(r.live.rsi)}<small className="live-provisional">잠정</small></td><td>{fmt(r.rsi)}</td><td className="rsi-muted">—</td><td><span className={`rsi-state ${r.live.state}`}>{stateLabel(r.live.state)}{r.live.entry?' · 진입(잠정)':''}</span></td></>:<>
   <td className="rsi-num">{fmt(r.rsi)}</td><td>{fmt(r.prev_rsi)}</td><td className="rsi-muted">{fmt(r.cutler)}</td><td>{r.rsi==null?<span className="rsi-muted">{reasonLabel(r.reason)||'산출 불가'}</span>:<span className={`rsi-state ${r.state}`}>{stateLabel(r.state)}{r.entry_today?' · 오늘 진입':''}{unsettled(r)?' · 안정화 전':''}</span>}</td></>}<td><RsiSpark series={r.series}/></td></tr>
  {open===r.key&&<tr className="rsi-detail-row"><td colSpan={cols}><RsiStockDetail name={r.name} sub={r.sub} series={r.series} currency={currency} onClose={()=>setOpen(null)}/></td></tr>}</Fragment>)}</tbody></table></div>
 </div>;
}

/** 시장 현황: 국내(KOSPI·KOSDAQ) or 미국(S&P500·NASDAQ) — 6-month daily candles, volume and RSI(14) per index,
 *  then (국내) the whole-market investor flow passed in as `flow`, then the market-cap top list (국내 30 with 4-investor net buying, 미국 50). */
export default function IndexRsi({region,onRegion,flow,dataset,loaded}:{region:Region;onRegion:(r:Region)=>void;flow?:ReactNode;dataset?:Dataset;loaded?:InvestorDatasets}){
 const [data,setData]=useState<RsiData|null>(null),[error,setError]=useState(''),[period,setPeriod]=useState<Period>('1');
 useEffect(()=>{readRsi().then(setData).catch(()=>setError('지수·시총 상위 자료를 아직 불러올 수 없습니다.'));},[]);
 const usSymbols=useMemo(()=>data?.us?[...Object.values(data.us.indices).map(x=>x.symbol).filter((x):x is string=>!!x),...data.us.top30.map(t=>t.symbol)]:[],[data]);
 const usLive=useUsLive(region==='us',usSymbols);
 const flows=useMemo<FlowCol[]|undefined>(()=>!dataset||!loaded?undefined:STAT_INVESTORS.map(([key,label])=>{
  const source=key==='연기금 등'?dataset:loaded.others[key];
  return {key,label,stocks:source?new Map(source.stocks.map(s=>[s.code,s])):null,status:key==='연기금 등'?'':loaded.statuses[key]??''};
 }),[dataset,loaded]);
 const toggle=<div className="rsi-region market-region" role="group" aria-label="시장 선택"><button type="button" aria-pressed={region==='kr'} onClick={()=>onRegion('kr')}>국내</button><button type="button" aria-pressed={region==='us'} onClick={()=>onRegion('us')}>미국</button><button type="button" aria-pressed={region==='semi'} onClick={()=>onRegion('semi')}>반도체 지수</button></div>;
 if(region==='semi')return <div className="market-overview"><section className="index-rsi" aria-label="반도체 지수">
  <div className="rsi-title"><h3>반도체 지수 SOXX <small>사이클 · 로그 피보나치 · 양봉업자 전략 요약과 자료 검증</small></h3>{toggle}</div>
  <Suspense fallback={<div className="chart-empty" role="status">반도체 지수 차트를 불러오는 중…</div>}><SemiCycle/></Suspense>
 </section></div>;
 if(error)return <>{toggle}<p className="notice">{error}</p>{region==='kr'&&flow}</>;
 if(!data)return <>{toggle}<div className="chart-empty rsi-loading" role="status">지수 차트를 불러오는 중…</div>{region==='kr'&&flow}</>;
 const us=data.us,top=data.domestic_top30;
 const flowAsOf=dataset?.manifest.as_of;
 return <div className="market-overview">
  <section className="index-rsi" aria-label={region==='kr'?'국내 지수':'미국 지수'}>
   <div className="rsi-title"><h3>{region==='kr'?'국내 지수':'미국 지수'} <small>일봉 · 거래량 · RSI(14) Wilder · 최근 6개월</small></h3>{toggle}
    <span>기준일 {region==='kr'?data.as_of:us?.as_of??'—'}{region==='us'&&us?' (미국 현지 거래일)':''}</span></div>
   <p className="rsi-zone-legend"><i className="low"/>30 미만 과매도 구간 <i className="high"/>70 이상 과매수 구간</p>
   {region==='us'&&<p className={`us-live-status ${usLive.state}`} role="status">{usLive.state==='on'?`실시간 시세(종목 Finnhub · 지수 Yahoo) · 1분마다 갱신 · 현재가·등락률과 장중 RSI(잠정: 오늘 현재가를 오늘 종가로 보고 계산, 장 마감 뒤 수집 때 확정) · 미국 정규장 한국시간 23:30~06:00(서머타임 22:30~05:00)${Object.keys(usLive.missing).filter(k=>!INDEX_PROXY[k]).length?` · 시세 없음 ${Object.keys(usLive.missing).filter(k=>!INDEX_PROXY[k]).join(', ')}`:''}`:usLive.state==='off'?`실시간 시세 꺼짐 · ${usLive.message??''}`:usLive.state==='error'?`실시간 시세를 받지 못했습니다(${usLive.message}). 1분 뒤 다시 시도합니다.`:'실시간 시세 확인 중…'}</p>}
   {region==='kr'?<div className="index-chart-grid">{['KOSPI','KOSDAQ'].map(n=><IndexChart key={n} name={n} x={data.indices[n]}/>)}</div>
    :us?<div className="index-chart-grid">{Object.entries(us.indices).map(([n,x])=>{const q=x.symbol?usLive.quotes[x.symbol]:undefined,p=x.symbol?INDEX_PROXY[x.symbol]:undefined;
     return <IndexChart key={n} name={n} x={x} live={liveView(q,x.wilder,x.series.at(-1)?.date,x.summary.rsi)} proxy={!q&&p&&usLive.quotes[p]?{symbol:p,quote:usLive.quotes[p]}:null}/>;})}</div>
    :<p className="notice">미국 자료가 아직 수집되지 않았습니다. 다음 수집 뒤 표시됩니다.</p>}
   <p className="source-note">{region==='kr'?'KOSPI·KOSDAQ 가격지수·거래량 NAVER 금융':`S&P500(^GSPC)·NASDAQ 종합(^IXIC) ${us?.price_source??'Yahoo Finance'}`} · 지수 RSI는 1년 이상 과거 종가로 미리 계산 · 투자 권유 아님</p>
  </section>
  {region==='kr'&&flow}
  <section className="index-rsi" aria-label={region==='kr'?'국내 시가총액 상위':'미국 시가총액 상위'}>
   {region==='kr'?top?<TopTable currency="KRW" title={`국내 시가총액 상위 ${top.items.length}`} note={`시총 기준일 ${top.cap_date} · 수집 대상 보통주 기준 · 원 종가`}
     flows={flows} period={period} onPeriod={setPeriod}
     flowNote={`${period==='1'?`최근일${flowAsOf?` ${flowAsOf.slice(5)}`:''}`:`${period}거래일 합계`} · 기관합계는 연기금·사모 포함 · 외국인은 기타외국인 제외${flowAsOf&&flowAsOf!==data.as_of?` · 수급 기준일 ${flowAsOf}`:''}`}
     rows={top.items.map(s=>({...s,key:s.code,sub:`${s.code} · ${s.market}`,cap:krCap(s.market_cap),close:s.close==null?'—':`${s.close.toLocaleString('ko-KR')}원`}))}/>
    :<p className="notice">국내 시가총액 스냅샷이 없어 상위 30을 만들지 못했습니다.</p>
   :us?<><TopTable currency="USD" title={`미국 시가총액 상위 ${us.top30.length}`} note={`시총 기준일 ${us.cap_date??'—'} · ${us.cap_source??''} · ${us.price_basis} · USD`} rows={us.top30.map(s=>({...s,live:liveView(usLive.quotes[s.symbol],s.wilder,s.last_date,s.rsi),key:s.symbol,sub:s.symbol,cap:usCap(s.market_cap_usd),close:s.close==null?'—':`$${s.close.toFixed(2)}`}))}/>
    <p className="source-note">가격 {us.price_source??'—'} · 수집 {us.collected_at??'—'} · 미국 장 마감(한국시간 다음날 새벽) 뒤 수집분까지 반영 · 미국 주식은 투자자별 수급 자료가 없습니다</p></>:null}
   <p className="source-note">원 종가 기준(미국은 분할 조정) · 국내는 KRX 정규장 공식 종가 기준 · 증권사 HTS·MTS의 통합 시세(KRX+넥스트레이드 장후 거래 포함)와는 RSI가 0.3~0.5 정도 다를 수 있음 · 증권사 HTS·MTS 기본 RSI와 같은 Wilder 방식(전일 평균×13 + 당일 변동, ÷14) · 재시작 뒤 60거래일 미만은 ‘안정화 전’ · Cutler(직전 14일 단순평균)는 참고값 · 결측·가격 단절 뒤에는 다시 계산 · 투자 권유 아님</p>
  </section>
 </div>;
}
