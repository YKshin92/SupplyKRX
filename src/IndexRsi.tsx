import {Fragment,useEffect,useMemo,useState,type ReactNode} from 'react';
import {ResponsiveContainer,ComposedChart,Bar,XAxis,YAxis,Tooltip,CartesianGrid} from 'recharts';
import {Candle} from './ChartPrimitives';
import VolumeChart from './VolumeChart';
import RsiStockDetail from './RsiStockDetail';
import RsiChart,{zoneEntries} from './RsiChart';
import RsiSpark from './RsiSpark';
import {readRsi,stateLabel,reasonLabel,unsettled,type RsiData,type RsiIndex,type RsiSummary,type RsiPoint} from './rsi-data';
import {type Dataset,type Stock,integer,sign} from './data';
import {STAT_INVESTORS,type InvestorDatasets} from './MarketFlow';
import './rsi.css';

export type Region='kr'|'us';
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
/** One index: daily candles, volume and Wilder RSI(14) on one shared date axis (about 6 months). */
function IndexChart({name,x}:{name:string;x?:RsiIndex}){
 const series=x?.series??[];
 const data=useMemo(()=>series.map((r,i)=>({...r,wick:r.low!=null&&r.high!=null?[r.low,r.high]:null,previousClose:series[i-1]?.close??null})),[series]);
 if(!x)return <article className="index-chart-card"><strong>{name}</strong><p className="notice">지수 자료 없음</p></article>;
 const s=x.summary,last=series.at(-1),prev=series.at(-2);
 const change=last?.close!=null&&prev?.close?(last.close/prev.close-1)*100:null;
 const sync=`index-${name}`;
 const months=series.length?`${series[0].date} ~ ${last!.date} · ${series.length}거래일`:'';
 return <article className={`index-chart-card ${s.state??''}`} aria-label={`${name} 일봉·거래량·RSI`}>
  <div className="index-chart-head">
   <div><strong>{name}</strong><span className="index-chart-close">{points(last?.close)}</span><span className={`index-chart-change ${sign(change)}`}>{pct(change)}</span><small>{months}</small></div>
   <div className="index-chart-rsi"><span>RSI(14)</span><b>{fmt(s.rsi)}</b><em className={`rsi-state ${s.state??''}`}>{stateLabel(s.state)}</em>{s.entry_today&&<span className="rsi-event">오늘 30 하향 진입</span>}<small>전일 {fmt(s.prev_rsi)} · Cutler 참고 {fmt(s.cutler)}{unsettled(s)?' · 안정화 전':''}</small></div>
  </div>
  <h5>일봉</h5>
  <div className="index-chart-price"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} syncId={sync} margin={{top:8,right:10,left:0,bottom:0}}>
   <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 5"/>
   <XAxis dataKey="date" tickFormatter={v=>String(v).slice(5)} tick={{fontSize:11,fill:'var(--muted)'}} minTickGap={24}/>
   <YAxis domain={['auto','auto']} width={Y} tick={{fontSize:11,fill:'var(--muted)'}} tickFormatter={v=>Number(v).toLocaleString('ko-KR',{maximumFractionDigits:0})}/>
   <Tooltip content={({active,payload,label})=>{const r=payload?.[0]?.payload as (typeof data)[number]|undefined;if(!active||!r)return null;const c=r.close!=null&&r.previousClose?(r.close/r.previousClose-1)*100:null;
    return <div className="chart-tip"><strong>{label}</strong><div>시가 {points(r.open)} · 고가 {points(r.high)}</div><div>저가 {points(r.low)} · 종가 {points(r.close)} <span className={sign(c)}>{pct(c)}</span></div><div>거래량 {r.volume==null?'—':`${integer(r.volume)}주`}</div></div>;}}/>
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
type Row=RsiSummary&{rank:number;key:string;name:string;sub:string;cap:string;close:string;series:RsiPoint[]};
function TopTable({title,note,rows,currency,flows,period,onPeriod,flowNote}:{title:string;note:string;rows:Row[];currency:'KRW'|'USD';flows?:FlowCol[];period?:Period;onPeriod?:(p:Period)=>void;flowNote?:string}){
 const [open,setOpen]=useState<string|null>(null);
 const value=(s:Stock|undefined)=>!s?null:period==='5'?s.sum5:period==='20'?s.sum20:s.net;
 const cols=9+(flows?.length??0);
 return <div className="rsi-top">
  <div className="rsi-top-title"><h4>{title}</h4><span>{note} · 종목을 누르면 일봉·거래량·RSI 차트가 열립니다</span></div>
  {flows&&onPeriod&&<div className="top-flow-controls"><span>투자자별 순매수 대금</span><div className="rsi-region" role="group" aria-label="순매수 기간">{([['1','최근일'],['5','5일 합'],['20','20일 합']] as const).map(([k,l])=><button key={k} type="button" aria-pressed={period===k} onClick={()=>onPeriod(k)}>{l}</button>)}</div>{flowNote&&<small>{flowNote}</small>}</div>}
  <div className="lab-scroll"><table className="rsi-top-table"><thead><tr><th>순위</th><th>종목</th><th>시가총액</th><th>종가</th>{flows?.map(f=><th key={f.key} className="flow-col" title={f.status||undefined}>{f.label}</th>)}<th>RSI</th><th>전일</th><th>Cutler 참고</th><th>상태</th><th>최근 흐름</th></tr></thead>
  <tbody>{rows.map(r=><Fragment key={r.key}><tr className={`${r.state??''}${open===r.key?' open':''}`} tabIndex={0} aria-expanded={open===r.key} onClick={()=>setOpen(open===r.key?null:r.key)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();setOpen(open===r.key?null:r.key);}}}><td>{r.rank}</td><td><strong>{r.name}</strong><small>{r.sub}</small></td><td>{r.cap}</td><td>{r.close}</td>
   {flows?.map(f=>{const v=f.stocks?value(f.stocks.get(r.key)):null;return <td key={f.key} className={`flow-col ${sign(v)}`}>{f.stocks?flowAmount(v):<span className="rsi-muted">…</span>}</td>;})}
   <td className="rsi-num">{fmt(r.rsi)}</td><td>{fmt(r.prev_rsi)}</td><td className="rsi-muted">{fmt(r.cutler)}</td><td>{r.rsi==null?<span className="rsi-muted">{reasonLabel(r.reason)||'산출 불가'}</span>:<span className={`rsi-state ${r.state}`}>{stateLabel(r.state)}{r.entry_today?' · 오늘 진입':''}{unsettled(r)?' · 안정화 전':''}</span>}</td><td><RsiSpark series={r.series}/></td></tr>
  {open===r.key&&<tr className="rsi-detail-row"><td colSpan={cols}><RsiStockDetail name={r.name} sub={r.sub} series={r.series} currency={currency} onClose={()=>setOpen(null)}/></td></tr>}</Fragment>)}</tbody></table></div>
 </div>;
}

/** 시장 현황: 국내(KOSPI·KOSDAQ) or 미국(S&P500·NASDAQ) — 6-month daily candles, volume and RSI(14) per index,
 *  then (국내) the whole-market investor flow passed in as `flow`, then the market-cap top list (국내 30 with 4-investor net buying, 미국 50). */
export default function IndexRsi({region,onRegion,flow,dataset,loaded}:{region:Region;onRegion:(r:Region)=>void;flow?:ReactNode;dataset?:Dataset;loaded?:InvestorDatasets}){
 const [data,setData]=useState<RsiData|null>(null),[error,setError]=useState(''),[period,setPeriod]=useState<Period>('1');
 useEffect(()=>{readRsi().then(setData).catch(()=>setError('지수·시총 상위 자료를 아직 불러올 수 없습니다.'));},[]);
 const flows=useMemo<FlowCol[]|undefined>(()=>!dataset||!loaded?undefined:STAT_INVESTORS.map(([key,label])=>{
  const source=key==='연기금 등'?dataset:loaded.others[key];
  return {key,label,stocks:source?new Map(source.stocks.map(s=>[s.code,s])):null,status:key==='연기금 등'?'':loaded.statuses[key]??''};
 }),[dataset,loaded]);
 const toggle=<div className="rsi-region market-region" role="group" aria-label="시장 선택"><button type="button" aria-pressed={region==='kr'} onClick={()=>onRegion('kr')}>국내</button><button type="button" aria-pressed={region==='us'} onClick={()=>onRegion('us')}>미국</button></div>;
 if(error)return <>{toggle}<p className="notice">{error}</p>{region==='kr'&&flow}</>;
 if(!data)return <>{toggle}<div className="chart-empty rsi-loading" role="status">지수 차트를 불러오는 중…</div>{region==='kr'&&flow}</>;
 const us=data.us,top=data.domestic_top30;
 const flowAsOf=dataset?.manifest.as_of;
 return <div className="market-overview">
  <section className="index-rsi" aria-label={region==='kr'?'국내 지수':'미국 지수'}>
   <div className="rsi-title"><h3>{region==='kr'?'국내 지수':'미국 지수'} <small>일봉 · 거래량 · RSI(14) Wilder · 최근 6개월</small></h3>{toggle}
    <span>기준일 {region==='kr'?data.as_of:us?.as_of??'—'}{region==='us'&&us?' (미국 현지 거래일)':''}</span></div>
   <p className="rsi-zone-legend"><i className="low"/>30 미만 과매도 구간 <i className="high"/>70 이상 과매수 구간</p>
   {region==='kr'?<div className="index-chart-grid">{['KOSPI','KOSDAQ'].map(n=><IndexChart key={n} name={n} x={data.indices[n]}/>)}</div>
    :us?<div className="index-chart-grid">{Object.entries(us.indices).map(([n,x])=><IndexChart key={n} name={n} x={x}/>)}</div>
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
   :us?<><TopTable currency="USD" title={`미국 시가총액 상위 ${us.top30.length}`} note={`시총 기준일 ${us.cap_date??'—'} · ${us.cap_source??''} · ${us.price_basis} · USD`} rows={us.top30.map(s=>({...s,key:s.symbol,sub:s.symbol,cap:usCap(s.market_cap_usd),close:s.close==null?'—':`$${s.close.toFixed(2)}`}))}/>
    <p className="source-note">가격 {us.price_source??'—'} · 수집 {us.collected_at??'—'} · 미국 장 마감(한국시간 다음날 새벽) 뒤 수집분까지 반영 · 미국 주식은 투자자별 수급 자료가 없습니다</p></>:null}
   <p className="source-note">원 종가 기준(미국은 분할 조정) · 국내는 KRX 정규장 공식 종가 기준 · 증권사 HTS·MTS의 통합 시세(KRX+넥스트레이드 장후 거래 포함)와는 RSI가 0.3~0.5 정도 다를 수 있음 · 증권사 HTS·MTS 기본 RSI와 같은 Wilder 방식(전일 평균×13 + 당일 변동, ÷14) · 재시작 뒤 60거래일 미만은 ‘안정화 전’ · Cutler(직전 14일 단순평균)는 참고값 · 결측·가격 단절 뒤에는 다시 계산 · 투자 권유 아님</p>
  </section>
 </div>;
}
