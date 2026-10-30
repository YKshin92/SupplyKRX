import {useEffect,useMemo,useState} from 'react';
import {integer,amountLabel,sign} from './data';
import './rsi.css';
type High={code:string;name:string;market:string|null;close:number;high:number;prior_high:number;prior_high_date:string;prior_close_high:number;distance:number;new_high:boolean;close_new_high:boolean;near:boolean;full_window:boolean;coverage_from:string;sessions_covered:number;old_high_gap:number;recent_new_highs:number;adjusted:boolean;pension_net:number|null;pension_5d:number|null;pension_20d:number|null;rsi:number|null;rank_top20:boolean};
type Data={schema_version:1;as_of:string;rules:{window:number;near:number;listed_within:number};population:number;counts:Record<string,number>;stocks:High[]};
type Mode='new'|'close'|'near'|'pension'|'all';
/** 종목 발굴 · 3년 신고가: today's new highs and stocks close to their prior 3-year high, with pension context. */
export default function HighsExplorer({open}:{open:(code:string,element?:HTMLElement)=>void}){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState('');
 const [mode,setMode]=useState<Mode>('new'),[search,setSearch]=useState(''),[market,setMarket]=useState('ALL'),[order,setOrder]=useState('distance'),[page,setPage]=useState(1);
 useEffect(()=>{import('./data.ts').then(d=>d.json<Data>('/data/live/new-highs/latest.json')).then(d=>{if(!d||d.schema_version!==1||!Array.isArray(d.stocks))throw Error();setData(d);}).catch(()=>setError('신고가 자료를 아직 불러올 수 없습니다. 다음 갱신 후 다시 확인해 주세요.'));},[]);
 useEffect(()=>setPage(1),[mode,search,market,order]);
 const rows=useMemo(()=>{if(!data)return [] as High[];const q=search.trim().toLowerCase();return data.stocks.filter(s=>(mode==='all'||(mode==='new'?s.new_high:mode==='close'?s.close_new_high:mode==='near'?!s.new_high&&s.near:s.new_high&&(s.pension_net??0)>0))&&(market==='ALL'||s.market===market)&&(!q||`${s.name} ${s.code}`.toLowerCase().includes(q))).sort((a,b)=>order==='gap'?b.old_high_gap-a.old_high_gap:order==='pension'?(b.pension_5d??-1e18)-(a.pension_5d??-1e18):order==='recent'?b.recent_new_highs-a.recent_new_highs:b.distance-a.distance);},[data,mode,search,market,order]);
 if(error)return <div className="notice">{error}</div>;
 if(!data)return <div className="chart-empty" role="status">신고가 목록을 불러오는 중…</div>;
 const c=data.counts;const pages=Math.max(1,Math.ceil(rows.length/20)),current=Math.min(page,pages);const years=(data.rules.window/245).toFixed(0);
 return <section className="rsi-explorer highs-explorer" aria-label="3년 신고가">
  <div className="rsi-title"><h2>{years}년 신고가 <span>수정주가 · 장중 고가 기준</span></h2><span>기준일 {data.as_of}</span></div>
  <div className="rsi-counts"><span>오늘 신고가 <b>{integer(c.new_high)}</b><small>3년치 자료 완비 {integer(c.full_new_high)}</small></span><span>종가 신고가 <b>{integer(c.close_new_high)}</b></span><span>{data.rules.near}% 이내 근접 <b>{integer(c.near)}</b></span><span>신고가 + 연기금 순매수 <b>{integer(c.with_pension)}</b></span></div>
  <div className="quick-filters" role="group" aria-label="신고가 보기">{([['new','오늘 신고가'],['close','종가 신고가'],['near',`${data.rules.near}% 이내 근접`],['pension','신고가 + 연기금 순매수'],['all',`${data.rules.listed_within}% 이내 전체`]] as [Mode,string][]).map(([m,label])=><button key={m} className={mode===m?'active':''} aria-pressed={mode===m} onClick={()=>setMode(m)}>{label}</button>)}</div>
  <p className="filter-guidance">신고가는 오늘 장중 고가가 직전 {years}년(약 {data.rules.window}거래일) 최고가를 넘은 종목입니다. 3년치 자료가 없는 종목(신규 상장·장기 거래정지 등)은 ‘보유 자료 기준’으로 따로 표시합니다. ‘고점 간격’은 직전 최고가가 나온 뒤 지난 거래일 수로, 길수록 오래된 고점을 넘은 것입니다.</p>
  <div className="basic-filters rsi-filters"><label>종목 검색<input aria-label="신고가 종목 검색" value={search} onChange={e=>setSearch(e.target.value)} placeholder="종목명 / 코드"/></label><label>시장<select aria-label="신고가 시장" value={market} onChange={e=>setMarket(e.target.value)}><option value="ALL">전체</option><option>KOSPI</option><option>KOSDAQ</option></select></label><label>정렬<select aria-label="신고가 정렬" value={order} onChange={e=>setOrder(e.target.value)}><option value="distance">최고가 대비 높은 순</option><option value="gap">오래된 고점 돌파 순</option><option value="recent">최근 20일 신고가 횟수 순</option><option value="pension">연기금 5일 순매수 큰 순</option></select></label></div>
  <div className="explorer-table-scroll"><table className="explorer-table rsi-table"><thead><tr><th>종목 / 시장</th><th className="numeric">종가</th><th className="numeric">직전 최고가 대비</th><th>직전 최고가</th><th className="numeric">고점 간격</th><th className="numeric">20일 신고가</th><th className="numeric">연기금 오늘 / 5일</th><th className="numeric">RSI</th></tr></thead><tbody>{rows.slice((current-1)*20,current*20).map(s=><tr key={s.code} tabIndex={0} onClick={e=>open(s.code,e.currentTarget)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();open(s.code,e.currentTarget);}}}>
   <td><strong>{s.name}</strong><small>{s.code} · {s.market}{s.rank_top20?' · 수급 상위 20':''}</small></td>
   <td className="numeric">{integer(Math.round(s.close))}원{s.new_high&&<span className="rsi-event high">{s.close_new_high?'종가 신고가':'장중 신고가'}</span>}</td>
   <td className={`numeric ${s.distance>=0?'positive':''}`}><strong>{s.distance>0?'+':''}{s.distance.toFixed(2)}%</strong></td>
   <td>{integer(Math.round(s.prior_high))}원<small>{s.prior_high_date}{s.full_window?'':` · 보유 자료 기준(${s.coverage_from}~)`}{s.adjusted?' · 수정주가':''}</small></td>
   <td className="numeric">{s.old_high_gap}거래일</td>
   <td className="numeric">{s.recent_new_highs}회</td>
   <td className="numeric"><span className={sign(s.pension_net)}>{amountLabel(s.pension_net)}</span><small className={sign(s.pension_5d)}>{amountLabel(s.pension_5d)}</small></td>
   <td className="numeric">{s.rsi==null?'—':s.rsi.toFixed(1)}</td></tr>)}</tbody></table></div>
  {!rows.length&&<p className="no-results">조건에 맞는 종목이 없습니다.</p>}
  <div className="table-footer"><span>{integer(rows.length)}종목 · 20종목씩 · 행을 누르면 종목 상세</span><span><button disabled={current<=1} onClick={()=>setPage(current-1)}>이전</button> {current}/{pages} <button disabled={current>=pages} onClick={()=>setPage(current+1)}>다음</button></span></div>
  <p className="source-note">KRX 정규장 종가·고가를 등락률로 설명되는 액면분할·병합 등에 맞춰 수정주가로 보정한 값입니다. 거래정지일(거래량 0)은 건너뜁니다. 모니터링 지표이며 연기금 신호·점수·매매 규칙에는 반영하지 않습니다. 투자 권유 아님.</p>
 </section>;
}
