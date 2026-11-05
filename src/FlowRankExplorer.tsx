import {useEffect,useMemo,useRef,useState} from 'react';
import {Star} from 'lucide-react';
import {amountLabel,integer,sign} from './data';
import {compareRanks,loadRanks,rankInvestors,RANK_VIEWS,type RankComponent,type RankStock,type RankView} from './flow-rank-data';
import DetailDrawer from './DetailDrawer';
import Rank8Research from './Rank8Research';
import ScoreResearchStatus from './ScoreResearchStatus';
import './flow-ranks.css';

const investorName=(name:string)=>name==='연기금 등'?'연기금':name;
const VIEW_KEY='flow-rank-view';
function RankCell({c,relative=false}:{c?:RankComponent;relative?:boolean}){
 return <><strong className={sign(c?.value)}>{c?.value==null?'자료 부족':relative?`${c.value.toFixed(4)}%`:amountLabel(c.value)}</strong><small>{c?.rank==null?'순위 미산출':`${integer(c.rank)}위 / ${integer(c.population)}종목`}</small></>;
}
/** 전일 대비 순위 변동: ▲ up (rank number fell), ▼ down, NEW when the stock had no score the session before. */
function RankDelta({s,hasPrevious}:{s:RankStock;hasPrevious:boolean}){
 if(!hasPrevious||s.score_rank==null)return <span className="rank-delta none">—</span>;
 if(s.new_entry)return <span className="rank-delta new">NEW</span>;
 const d=s.rank_change??null;
 if(d==null)return <span className="rank-delta none">—</span>;
 if(d===0)return <span className="rank-delta flat">=</span>;
 return <span className={`rank-delta ${d>0?'up':'down'}`}>{d>0?'▲':'▼'}{integer(Math.abs(d))}</span>;
}
/** 연기금 badges from the 매매법 conditions, plus 되돌림 주의 for 외국인·기관합계·사모 시총 대비 상위 5%. */
function Badges({s}:{s:RankStock}){
 const p=s.pension;const out=[];
 if(p?.signal)out.push(<em key="sig" className="rank-badge signal" title="연기금 순매수 3억 이상 · 직전 3개월 매수 0원·매도 1억 미만 · 거래량 20일 평균 3배 이하">매매법 신호</em>);
 else if(p?.first_buy)out.push(<em key="first" className="rank-badge first" title="직전 3개월 연기금 매수 0원·매도 1억 미만이던 종목을 기준일에 처음 매수">연기금 첫 매수</em>);
 else if(p?.quiet_3m)out.push(<em key="quiet" className="rank-badge quiet" title="직전 3개월 연기금 매수 0원 · 매도 합계 1억 미만">3개월 무매수</em>);
 for(const i of s.caution??[])out.push(<em key={i} className="rank-badge caution" title={`${i} 시총 대비 순매수가 전체 상위 5% · 과거 8년(2019~2026) 검증에서 이 투자자의 시총 대비 1위 종목은 다음 5일 평균이 시장보다 낮았음`}>{i} 되돌림 주의</em>);
 return out.length?<div className="rank-badges">{out}</div>:null;
}
export default function FlowRankExplorer({asOf,revision,watch,toggle,open}:{asOf:string;revision:string;watch:string[];toggle:(code:string)=>void;open:(code:string,element?:HTMLElement)=>void}){
 const [view,setView]=useState<RankView>(()=>{try{const v=localStorage.getItem(VIEW_KEY);return (RANK_VIEWS.some(([k])=>k===v)?v:'20d') as RankView;}catch{return '20d';}});
 const [result,setResult]=useState<Awaited<ReturnType<typeof loadRanks>>|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const [search,setSearch]=useState(''),[market,setMarket]=useState('ALL'),[onlyWatch,setOnlyWatch]=useState(false),[onlyPension,setOnlyPension]=useState(false),[order,setOrder]=useState('pension_score'),[ascending,setAscending]=useState(false),[page,setPage]=useState(1),[selected,setSelected]=useState<RankStock|null>(null);
 const opener=useRef<HTMLElement|null>(null);
 useEffect(()=>{try{localStorage.setItem(VIEW_KEY,view);}catch{/* per-viewer convenience only */}},[view]);
 useEffect(()=>{let cancelled=false;setResult(null);setError('');setSelected(null);loadRanks(view,asOf,revision).then(data=>{if(!cancelled)setResult(data);}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'수급 순위 로드 실패');});return()=>{cancelled=true;};},[view,asOf,revision,retry]);
 const list=useMemo(()=>{const query=search.trim().toLowerCase();return (result?.stocks??[]).filter(s=>(!query||(s.name||s.code).toLowerCase().includes(query)||s.code.includes(query))&&(market==='ALL'||s.market===market)&&(!onlyWatch||watch.includes(s.code))&&(!onlyPension||s.pension?.quiet_3m)).sort((a,b)=>compareRanks(a,b,order,ascending));},[result,search,market,onlyWatch,onlyPension,watch,order,ascending]);
 useEffect(()=>{setPage(p=>Math.min(p,Math.max(1,Math.ceil(list.length/30))));},[list.length]);
 const m=result?.manifest,complete=result?.stocks.filter(s=>s.score!=null).length??0;
 const hasPrevious=!!m?.previous_as_of;
 const today=useMemo(()=>{const all=result?.stocks??[];
  const signals=all.filter(s=>s.pension?.signal),first=all.filter(s=>s.pension?.first_buy&&!s.pension?.signal);
  const risers=all.filter(s=>s.score_rank!=null&&s.score_rank<=50&&(s.new_entry||(s.rank_change??0)>=20)).sort((a,b)=>(a.score_rank??0)-(b.score_rank??0)).slice(0,12);
  return {signals,first,risers};},[result]);
 function close(){setSelected(null);opener.current?.focus({preventScroll:true});}
 function sort(key:string){setPage(1);if(order===key)setAscending(v=>!v);else{setOrder(key);setAscending(false);}}
 const heading=(key:string,label:string)=><th aria-sort={order===key?(ascending?'ascending':'descending'):'none'}><button onClick={()=>sort(key)}>{label}{order===key?(ascending?' ↑':' ↓'):''}</button></th>;
 const chip=(s:RankStock)=><button key={s.code} type="button" className="rank-chip" onClick={e=>{opener.current=e.currentTarget;setSelected(s);}}>{s.name||s.code}<small>{s.score_rank==null?'':`${integer(s.score_rank)}위`}{s.new_entry?' NEW':s.rank_change?` ${s.rank_change>0?'▲':'▼'}${integer(Math.abs(s.rank_change))}`:''}</small></button>;
 return <section className="rank-explorer" aria-label="8항목 수급 순위">
  <div className="rank-intro"><div><h2>수급 순위 <span>8항목</span></h2><p>네 투자자의 순매수 금액과 시총 대비 비중을 전체 종목 안에서 비교합니다. 기본 정렬은 연기금 두 항목 점수이고, 8항목 합계는 참고용입니다.</p></div>
   <div className="rank-view" role="group" aria-label="수급 집계 기간"><span>집계 기간</span>{RANK_VIEWS.map(([k,label])=><button key={k} type="button" aria-pressed={view===k} onClick={()=>{setView(k);setPage(1);}}>{label}</button>)}</div></div>
  <div className="rank-controls"><label>종목 검색<input placeholder="종목명 또는 코드" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></label><label>시장<select value={market} onChange={e=>{setMarket(e.target.value);setPage(1);}}><option value="ALL">전체</option><option>KOSPI</option><option>KOSDAQ</option></select></label><button className="button" aria-pressed={onlyWatch} onClick={()=>{setOnlyWatch(v=>!v);setPage(1);}}><Star size={15}/>관심 종목만</button><button className="button" aria-pressed={onlyPension} onClick={()=>{setOnlyPension(v=>!v);setPage(1);}}>3개월 무매수 종목만</button></div>
  {error?<div className="notice" role="alert">{error}<button className="button small" onClick={()=>setRetry(v=>v+1)}>다시 불러오기</button></div>:!result?<div className="chart-empty" role="status">전체 모집단의 수급 순위를 불러오는 중입니다…</div>:m?.state!=='ready'?<div className="chart-empty">수급 순위 준비 중 · {m?.reason??'기준일 모집단 또는 시총 자료가 필요합니다.'}</div>:<>
   <div className="rank-context"><span>{m.first_date} ~ {m.as_of} · {m.sessions}거래일</span><span>전체 {integer(m.population)}종목 · 시총 기준 {m.market_cap_date}</span><span>8항목 점수 확보 {integer(complete)}종목</span><span>{hasPrevious?`전일 ${m.previous_as_of} 순위와 비교`:'전일 순위 비교 불가'}</span></div>
   {m.as_of!==asOf&&<p className="notice">기본 수급 기준일 {asOf}과 순위 기준일 {m.as_of}이 다릅니다. 아래는 순위 기준일 자료입니다.</p>}
   {complete< m.population&&<p className="notice">기간 내 수급 자료가 부족한 항목은 금액·순위·총점을 보류합니다. 미수집을 0원으로 채우지 않습니다.{m.warmup_coverage!=='complete'?' 요청 기간의 거래일 달력도 일부 부족합니다.':''}</p>}
   {m.universe.classification_status!=='asof_observed'&&<p className="notice">과거 시점의 종목 분류를 확인하지 못했습니다. 현재 분류를 활용한 비교 자료입니다.</p>}
   <section className="rank-today" aria-label="기준일에 새로 보이는 종목">
    <h3>{m.as_of} 기준 새로 보이는 종목</h3>
    <div className="rank-today-row"><b>매매법 신호</b>{today.signals.length?today.signals.map(chip):<span className="rsi-muted">{m.pension_coverage==='complete'?'없음':'3개월 이력 부족'}</span>}<small>연기금 3억 이상 · 3개월 무매수 · 거래량 3배 이하</small></div>
    <div className="rank-today-row"><b>연기금 첫 매수</b>{today.first.length?today.first.map(chip):<span className="rsi-muted">없음</span>}<small>3개월 무매수 종목을 기준일에 처음 매수(금액 무관)</small></div>
    <div className="rank-today-row"><b>순위 급등 · 신규 진입</b>{hasPrevious?today.risers.length?today.risers.map(chip):<span className="rsi-muted">없음</span>:<span className="rsi-muted">전일 순위 없음</span>}<small>8항목 상위 50 안에서 하루에 20계단 이상 오르거나 새로 들어온 종목 · {RANK_VIEWS.find(([k])=>k===view)?.[1]} 집계</small></div>
   </section>
   <Rank8Research/>
   <ScoreResearchStatus asOf={asOf}/>
   <div className="results-toolbar"><div><h2>{integer(list.length)}종목</h2><p>필터를 바꿔도 순위의 전체 모집단은 유지됩니다.</p></div><div className="rank-sort"><label>정렬<select value={order} onChange={e=>{setOrder(e.target.value);setPage(1);}}><option value="pension_score">연기금 점수</option><option value="score">8항목 합계(참고)</option><option value="rank_change">전일 대비 순위 변동</option><option value="market_cap">시가총액</option>{rankInvestors.flatMap(i=>[<option key={`${i}:absolute`} value={`${i}:absolute`}>{investorName(i)} 순매수 금액</option>,<option key={`${i}:relative`} value={`${i}:relative`}>{investorName(i)} 시총 대비 비중</option>])}</select></label><button className="button small" onClick={()=>{setAscending(v=>!v);setPage(1);}}>{ascending?'낮은 순 ↑':'높은 순 ↓'}</button></div></div>
   <div className="rank-table-wrap"><table className="rank-table"><thead><tr><th>관심</th><th>종목</th>{heading('pension_score','연기금 점수')}{heading('score','8항목 합계')}{heading('rank_change','전일 대비')}{heading('market_cap','시가총액')}{rankInvestors.map(i=><th key={i} aria-sort={order===`${i}:absolute`?(ascending?'ascending':'descending'):'none'}><button onClick={()=>sort(`${i}:absolute`)}>{investorName(i)} 순매수{order===`${i}:absolute`?(ascending?' ↑':' ↓'):''}</button></th>)}</tr></thead><tbody>{list.slice((page-1)*30,page*30).map(s=><tr key={s.code} className={s.pension?.signal?'signal':s.pension?.first_buy?'first':''}><td><button className="star" aria-label={`${s.name} 관심 전환`} aria-pressed={watch.includes(s.code)} onClick={()=>toggle(s.code)}><Star size={17} fill={watch.includes(s.code)?'currentColor':'none'}/></button></td><td><button className="rank-stock-name" onClick={e=>{opener.current=e.currentTarget;setSelected(s);}}>{s.name||s.code}<small>{s.code} · {s.market}</small></button><Badges s={s}/></td><td><strong className="rank-score">{s.pension_score==null?'—':s.pension_score.toFixed(1)}</strong><small>{s.pension_score==null?'미확보':'/ 100점'}</small></td><td><strong className="rank-score ref">{s.score==null?'—':s.score.toFixed(1)}</strong><small>{s.score==null?'8항목 미확보':s.score_rank==null?'':`${integer(s.score_rank)}위`}</small></td><td><RankDelta s={s} hasPrevious={hasPrevious}/></td><td>{amountLabel(s.market_cap)}</td>{rankInvestors.map(i=><td key={i}><RankCell c={s.components[`${i}:absolute`]}/></td>)}</tr>)}</tbody></table></div>
   {!list.length&&<div className="chart-empty">해당 조건의 종목이 없습니다. 검색·시장·관심 조건을 완화해 주세요.</div>}
   <div className="table-footer"><span>결측값은 항상 마지막 · 동점은 중간순위</span>{list.length>30&&<div><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>이전</button> {page}/{Math.ceil(list.length/30)} <button disabled={page*30>=list.length} onClick={()=>setPage(p=>p+1)}>다음</button></div>}</div>
   <details className="rank-method"><summary>점수 계산과 데이터 범위</summary><p><strong>연기금 점수</strong> = 연기금 순매수 금액 항목 + 시총 대비 항목(각 최대 12.5점)을 4배 해 100점 만점으로 바꾼 값입니다. 2026-11-05 과거 8년(2019~2026) 검증에서 '전날 시총 대비 순매수 1위' 종목의 다음 5일 초과수익이 연기금만 양(+0.37%)이었고 외국인(−1.9%)·기관합계(−1.0%)·사모(−0.65%)는 되돌림이었기 때문에 기본 정렬로 둡니다. 연기금 점수 자체의 수익 검증은 아직 없습니다.</p><p><strong>8항목 합계(참고)</strong> {m.weighting}. 양의 순매수만 각 항목 최대 12.5점, 순매도·0원은 가점 0점입니다. 전진 검증 기록을 위해 계산식은 그대로 둡니다. 수익 확률이 아니며 기존 매수 관심 스코어 v2와 매매 규칙에는 적용하지 않습니다.</p><p><strong>전일 대비</strong>는 같은 집계 기간을 전 거래일({m.previous_as_of??'—'}) 기준으로 다시 계산한 8항목 합계 순위와의 차이입니다. ▲는 순위가 올라간 것, NEW는 전일에 점수가 없던 종목입니다.</p><p><strong>연기금 표시</strong> 3개월 무매수 = 직전 3개월 연기금 매수 0원·매도 합계 1억 미만(이력이 빠진 종목은 표시 없음). 첫 매수 = 그 종목을 기준일에 매수. 매매법 신호 = 여기에 순매수 3억 이상·거래량 20일 평균 3배 이하까지 충족(16시 알림·시뮬레이션과 같은 조건).</p><p>상대비중 = 순매수 / 기준일 시가총액 × 100. 각 항목의 순위는 해당 값이 확인된 전체 종목 기준이며 상세에서 분모를 확인할 수 있습니다.</p><p>{m.note} 분류 관측일 {m.universe.classification_observed_date}.</p></details>
  </>}
  {selected&&m&&<DetailDrawer name={selected.name} onClose={close}><div className="rank-detail"><div className="eyebrow">수급 순위 · {selected.market} · {selected.code} · {RANK_VIEWS.find(([k])=>k===view)?.[1]} 집계</div><h2>{selected.name}</h2><Badges s={selected}/><div className="rank-detail-score"><strong>{selected.pension_score==null?'미산출':selected.pension_score.toFixed(1)}</strong><span>연기금 점수 / 100점 · 8항목 합계 {selected.score==null?'미산출':`${selected.score.toFixed(1)}점 (${selected.score_rank==null?'—':integer(selected.score_rank)+'위'}`}{hasPrevious&&selected.score_rank!=null?selected.new_entry?', 전일 없음)':selected.rank_change!=null?`, 전일 ${integer(selected.previous_score_rank??0)}위)`:')':')'}<br/>기준일 {m.as_of} · 시총 {amountLabel(selected.market_cap)}</span></div><p>절대금액과 시총 대비 비중의 전체 종목 순위</p><div className="rank-matrix"><div>투자자</div><div>절대 순매수 금액</div><div>시총 대비 비중</div>{rankInvestors.map(i=><div className="rank-matrix-row" key={i}><h3>{investorName(i)}</h3>{['absolute','relative'].map(kind=>{const c=selected.components[`${i}:${kind}`];return <div key={kind}><RankCell c={c} relative={kind==='relative'}/><small>{c?.points==null?'점수 보류':`${c.points.toFixed(2)} / 12.5점`} · {c?.observations??0}/{m.sessions}거래일 확보</small></div>;})}</div>)}</div>{selected.pension?.volume_ratio_20!=null&&<p className="market-flow-note">기준일 거래량 20일 평균 대비 {selected.pension.volume_ratio_20.toFixed(2)}배 · 연기금 기준일 순매수 {amountLabel(selected.pension.net)}</p>}<p className="market-flow-note">기관합계에는 연기금·사모가 포함됩니다. 8항목은 동일 가중치 비교안입니다.</p><button className="button primary" onClick={()=>{const code=selected.code;setSelected(null);open(code,opener.current??undefined);}}>수급·일봉 상세 보기</button></div></DetailDrawer>}
 </section>;
}
