import {useEffect,useMemo,useState} from 'react';
import {readRsi,stateLabel,reasonLabel,type RsiData,type RsiStock,unsettled} from './rsi-data';
import {integer} from './data';
import './rsi.css';
type Mode='below'|'entry'|'all';
/** 종목 발굴 안의 RSI 보기: 30 미만 상태와 오늘 30 하향 진입 사건을 구분한다. */
export default function RsiExplorer({open}:{open:(code:string,element?:HTMLElement)=>void}){
 const [data,setData]=useState<RsiData|null>(null),[error,setError]=useState('');
 const [mode,setMode]=useState<Mode>('below'),[search,setSearch]=useState(''),[market,setMarket]=useState('ALL'),[order,setOrder]=useState('rsi'),[page,setPage]=useState(1);
 useEffect(()=>{readRsi().then(setData).catch(()=>setError('RSI 자료를 아직 불러올 수 없습니다. 다음 갱신 후 다시 확인해 주세요.'));},[]);
 useEffect(()=>setPage(1),[mode,search,market,order]);
 const rows=useMemo(()=>{if(!data)return [] as RsiStock[];const q=search.trim().toLowerCase();return data.stocks.filter(s=>(mode==='all'||(mode==='below'?s.state==='below30':s.entry_today))&&(market==='ALL'||s.market===market)&&(!q||`${s.name} ${s.code}`.toLowerCase().includes(q))).sort((a,b)=>{if(order==='streak')return b.below_streak-a.below_streak||(a.rsi??101)-(b.rsi??101);if(order==='change')return (a.change_pct??Infinity)-(b.change_pct??Infinity);if(order==='rsiDesc')return (b.rsi??-1)-(a.rsi??-1);return (a.rsi??101)-(b.rsi??101)||a.code.localeCompare(b.code);});},[data,mode,search,market,order]);
 if(error)return <div className="notice">{error}</div>;
 if(!data)return <div className="chart-empty" role="status">RSI 목록을 불러오는 중…</div>;
 const pages=Math.max(1,Math.ceil(rows.length/20)),current=Math.min(page,pages);
 return <section className="rsi-explorer" aria-label="RSI 30 미만 종목">
  <div className="rsi-title"><h2>RSI 30 미만 <span>Wilder 14일 · HTS/MTS 기본 방식</span></h2><span>기준일 {data.as_of}</span></div>
  <div className="rsi-counts"><span>대상 <b>{integer(data.population)}</b></span><span>산출 <b>{integer(data.computed)}</b></span><span>30 미만 <b>{integer(data.below30)}</b></span><span>오늘 30 하향 진입 <b>{integer(data.entries_today)}</b></span><span>산출 불가 <b>{integer(data.population-data.computed)}</b><small>관측 부족 {data.missing.warmup??0} · 기준일 거래 없음 {data.missing.invalid??0} · 보합 {data.missing.flat??0} · 단절 재시작 {data.missing.break_reset??0}</small></span></div>
  <div className="quick-filters" role="group" aria-label="RSI 보기">{([['below','30 미만 상태'],['entry','오늘 30 하향 진입'],['all','전체 종목']] as [Mode,string][]).map(([m,label])=><button key={m} className={mode===m?'active':''} aria-pressed={mode===m} onClick={()=>setMode(m)}>{label}</button>)}</div>
  <p className="filter-guidance">‘30 미만 상태’는 기준일 RSI가 30 미만인 모든 종목, ‘오늘 30 하향 진입’은 전일 30 이상에서 기준일 30 미만으로 내려온 종목입니다. 30 미만이 계속돼도 새 진입으로 세지 않습니다.</p>
  <div className="basic-filters rsi-filters"><label>종목 검색<input aria-label="RSI 종목 검색" value={search} onChange={e=>setSearch(e.target.value)} placeholder="종목명 / 코드"/></label><label>시장<select aria-label="RSI 시장" value={market} onChange={e=>setMarket(e.target.value)}><option value="ALL">전체</option><option>KOSPI</option><option>KOSDAQ</option></select></label><label>정렬<select aria-label="RSI 정렬" value={order} onChange={e=>setOrder(e.target.value)}><option value="rsi">RSI 낮은 순</option><option value="rsiDesc">RSI 높은 순</option><option value="streak">30 미만 연속일 긴 순</option><option value="change">등락률 낮은 순</option></select></label></div>
  <div className="explorer-table-scroll"><table className="explorer-table rsi-table"><thead><tr><th>종목 / 시장</th><th className="numeric">종가 / 등락률</th><th className="numeric">RSI(14)</th><th className="numeric">전일 RSI</th><th className="numeric">Cutler 참고</th><th className="numeric">30 미만 연속</th><th>최근 30 하향 진입</th></tr></thead><tbody>{rows.slice((current-1)*20,current*20).map(s=><tr key={s.code} tabIndex={0} onClick={e=>open(s.code,e.currentTarget)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();open(s.code,e.currentTarget);}}}>
   <td><strong>{s.name}</strong><small>{s.code} · {s.market}</small></td>
   <td className="numeric">{integer(s.close)}원<small className={s.change_pct!=null&&s.change_pct<0?'negative':'positive'}>{s.change_pct==null?'—':`${s.change_pct>0?'+':''}${s.change_pct.toFixed(2)}%`}</small></td>
   <td className="numeric"><strong>{s.rsi==null?'—':s.rsi.toFixed(1)}</strong><small>{s.rsi==null?reasonLabel(s.reason):stateLabel(s.state)}{unsettled(s)?' · 안정화 전':''}</small>{s.entry_today&&<span className="rsi-event">오늘 진입</span>}</td>
   <td className="numeric">{s.prev_rsi==null?'—':s.prev_rsi.toFixed(1)}</td><td className="numeric">{s.cutler==null?'—':s.cutler.toFixed(1)}</td>
   <td className="numeric">{s.below_streak?`${s.below_streak}거래일`:'—'}</td>
   <td>{s.last_entry_date??'—'}</td></tr>)}</tbody></table></div>
  {!rows.length&&<p className="no-results">조건에 맞는 종목이 없습니다.</p>}
  <div className="table-footer"><span>{integer(rows.length)}종목 · 20종목씩</span><span><button disabled={current<=1} onClick={()=>setPage(current-1)}>이전</button> {current}/{pages} <button disabled={current>=pages} onClick={()=>setPage(current+1)}>다음</button></span></div>
  <p className="source-note">원 종가 기준 Wilder RSI(14) — 증권사 HTS·MTS 기본 RSI와 같은 방식입니다. 참고용 Cutler(직전 14일 단순평균) 값도 함께 표시합니다. Wilder는 계산 시작점에 따라 값이 달라 1년 이상 과거 종가로 미리 계산하며, 재시작 뒤 60거래일 미만은 ‘안정화 전’으로 표시합니다. 거래량 0·결측·가격 단절(기업행사 포함) 이후에는 다시 15거래일을 모아 계산하고 값을 채우지 않습니다. 기존 연기금 신호·점수·매매 규칙에는 반영하지 않은 모니터링 지표입니다.</p>
 </section>;
}
