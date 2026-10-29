import {useEffect,useState} from 'react';
import RsiChart from './RsiChart';
import RsiSpark from './RsiSpark';
import {readRsi,stateLabel,reasonLabel,type RsiData,type RsiIndex,type RsiSummary,type RsiPoint} from './rsi-data';
import './rsi.css';

const fmt=(v:number|null|undefined,d=1)=>v==null?'—':v.toFixed(d);
const krCap=(v:number)=>v>=1e12?`${(v/1e12).toFixed(1)}조`:`${Math.round(v/1e8).toLocaleString('ko-KR')}억`;
const usCap=(v:number|null)=>v==null?'—':v>=1e12?`$${(v/1e12).toFixed(2)}T`:`$${(v/1e9).toFixed(0)}B`;

function IndexCard({name,x}:{name:string;x?:RsiIndex}){
 if(!x)return <article><strong>{name}</strong><p>지수 자료 없음</p></article>;
 const s=x.summary;
 return <article className={s.state??''}>
  <div className="index-rsi-head"><strong>{name}</strong>{s.entry_today&&<span className="rsi-event">오늘 30 하향 진입</span>}</div>
  <div className="index-rsi-value"><b>{fmt(s.rsi)}</b><span>{stateLabel(s.state)}</span><small>전일 {fmt(s.prev_rsi)}{s.last_entry_date?` · 최근 30 하향 진입 ${s.last_entry_date}`:''}</small></div>
  <div className="index-rsi-chart"><RsiChart series={x.series}/></div>
 </article>;
}

type Row=RsiSummary&{rank:number;key:string;name:string;sub:string;cap:string;close:string;series:RsiPoint[]};
function TopTable({title,note,rows}:{title:string;note:string;rows:Row[]}){
 return <div className="rsi-top">
  <div className="rsi-top-title"><h4>{title}</h4><span>{note}</span></div>
  <div className="table-scroll"><table className="rsi-top-table"><thead><tr><th>순위</th><th>종목</th><th>시가총액</th><th>종가</th><th>RSI</th><th>전일</th><th>상태</th><th>최근 흐름</th></tr></thead>
  <tbody>{rows.map(r=><tr key={r.key} className={r.state??''}><td>{r.rank}</td><td><strong>{r.name}</strong><small>{r.sub}</small></td><td>{r.cap}</td><td>{r.close}</td><td className="rsi-num">{fmt(r.rsi)}</td><td>{fmt(r.prev_rsi)}</td><td>{r.rsi==null?<span className="rsi-muted">{reasonLabel(r.reason)||'산출 불가'}</span>:<span className={`rsi-state ${r.state}`}>{stateLabel(r.state)}{r.entry_today?' · 오늘 진입':''}</span>}</td><td><RsiSpark series={r.series}/></td></tr>)}</tbody></table></div>
 </div>;
}

/** 시장 현황: index and top-30 market-cap Cutler RSI(14), domestic and US, for checking values by hand. */
export default function IndexRsi(){
 const [data,setData]=useState<RsiData|null>(null),[error,setError]=useState(''),[region,setRegion]=useState<'kr'|'us'>('kr');
 useEffect(()=>{readRsi().then(setData).catch(()=>setError('지수 RSI 자료를 아직 불러올 수 없습니다.'));},[]);
 if(error)return <p className="notice">{error}</p>;
 if(!data)return <div className="chart-empty rsi-loading" role="status">지수 RSI를 불러오는 중…</div>;
 const us=data.us,top=data.domestic_top30;
 return <section className="index-rsi" aria-label="지수 RSI">
  <div className="rsi-title"><h3>지수·시총 상위 RSI <small>Cutler 14일 · 단순이동평균</small></h3>
   <div className="rsi-region" role="group" aria-label="시장 선택"><button type="button" aria-pressed={region==='kr'} onClick={()=>setRegion('kr')}>국내</button><button type="button" aria-pressed={region==='us'} onClick={()=>setRegion('us')}>미국</button></div>
   <span>기준일 {region==='kr'?data.as_of:us?.as_of??'—'}{region==='us'&&us?' (미국 현지 거래일)':''}</span></div>
  <p className="rsi-zone-legend"><i className="low"/>30 미만 과매도 구간 <i className="high"/>70 이상 과매수 구간</p>
  {region==='kr'?<>
   <div className="index-rsi-grid">{['KOSPI','KOSDAQ'].map(n=><IndexCard key={n} name={n} x={data.indices[n]}/>)}</div>
   {top?<TopTable title="국내 시가총액 상위 30" note={`시총 기준일 ${top.cap_date} · 수집 대상 보통주 기준 · 원 종가`} rows={top.items.map(s=>({...s,key:s.code,sub:`${s.code} · ${s.market}`,cap:krCap(s.market_cap),close:s.close==null?'—':`${s.close.toLocaleString('ko-KR')}원`}))}/>:<p className="notice">국내 시가총액 스냅샷이 없어 상위 30을 만들지 못했습니다.</p>}
  </>:us?<>
   <div className="index-rsi-grid">{Object.entries(us.indices).map(([n,x])=><IndexCard key={n} name={n} x={x}/>)}</div>
   <TopTable title="미국 시가총액 상위 30" note={`시총 기준일 ${us.cap_date??'—'} · ${us.cap_source??''} · ${us.price_basis} · USD`} rows={us.top30.map(s=>({...s,key:s.symbol,sub:s.symbol,cap:usCap(s.market_cap_usd),close:s.close==null?'—':`$${s.close.toFixed(2)}`}))}/>
   <p className="source-note">가격 {us.price_source??'—'} · 수집 {us.collected_at??'—'} · 미국 장 마감(한국시간 다음날 새벽) 뒤 수집분까지 반영</p>
  </>:<p className="notice">미국 자료가 아직 수집되지 않았습니다. 다음 수집 뒤 표시됩니다.</p>}
  <p className="source-note">원 종가 기준(미국은 분할 조정) · 직전 14거래일 상승폭·하락폭을 단순평균(Cutler) · 기존 로컬 연구의 Wilder 방식과 다릅니다 · 결측·가격 단절 뒤에는 다시 15거래일을 모아 계산 · 증권사 HTS의 RSI(대부분 Wilder 방식)와 값이 다를 수 있습니다 · 투자 권유 아님</p>
 </section>;
}
