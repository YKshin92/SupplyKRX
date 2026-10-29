import ForeignRecordBadge from './ForeignRecordBadge';
import ScoreGuide from './ScoreGuide';
import DataLoading from './DataLoading';
import TouchOutcome from './TouchOutcome';
import {sessionData} from './history-cache';
import {readTracking} from './tracking-data';
import {buyScore} from './buy-score';
import {useEffect,useMemo,useState} from 'react';
import {Star} from 'lucide-react';
import {amountLabel,integer,json,sign} from './data';
import {percentLabel} from './price-change';
import {registrations,visibleTracking,type TrackingData,type View,type Sale,type TrackingEvent} from './tracking';

type Props={asOf:string;watch:string[];toggle:(code:string)=>void;open:(code:string,element:HTMLElement,event:TrackingEvent,lookback:number)=>void;selected:string};
const views:[View,string,string][]=[['all','전체 이력','과거 등록 및 매도 발생 종목 포함'],['new','신규 발견','최근 5거래일 내 등록'],['recent','최근 등록','최근 10거래일 내 등록'],['sustained','매수 지속','최근 10거래일 내 등록 · 순매수 2일 이상 · 이후 순매도일 없음']];
function Spark({values}:{values:(number|null)[]}){
 const max=Math.max(1,...values.map(v=>Math.abs(v??0))),step=100/values.length;
 return <svg className="spark" viewBox="0 0 100 28" role="img" aria-label={`등록일부터 ${values.length}거래일 연기금 순매수 흐름`}><line x1="0" x2="100" y1="14" y2="14" stroke="var(--border)"/>{values.map((v,i)=>v===null?<circle key={i} cx={(i+.5)*step} cy="14" r="1.5" fill="var(--muted)"/>:<rect key={i} x={i*step} y={v>=0?14-Math.abs(v)/max*12:14} width={step*.7} height={Math.max(.7,Math.abs(v)/max*12)} fill={v>=0?'#d95b68':'#4284d8'}/>)}</svg>;
}
export default function TrackingCases(p:Props){
 const [data,setData]=useState<TrackingData|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const [view,setView]=useState<View>('new'),[sale,setSale]=useState<Sale>('net');
 const [search,setSearch]=useState(''),[market,setMarket]=useState('ALL'),[order,setOrder]=useState('signal_date'),[page,setPage]=useState(1);
 const [lookback,setLookback]=useState(10),[strict,setStrict]=useState(false);
 const [inputs,setInputs]=useState({quiet:'1',net:'3',cap:'',latest:'0'}),[applied,setApplied]=useState(inputs);
 useEffect(()=>{let cancelled=false;setLoading(true);setError('');sessionData<TrackingData>(`tracking:${p.asOf}`,()=>readTracking('tracking-history',p.asOf,json)).catch(()=>readTracking('tracking-events',p.asOf,json)).then(d=>{if(!cancelled)setData(d);}).catch(e=>{if(!cancelled)setError(String(e));}).finally(()=>{if(!cancelled)setLoading(false);});return()=>{cancelled=true;};},[p.asOf]);
 useEffect(()=>{const timer=setTimeout(()=>setApplied(inputs),350);return()=>clearTimeout(timer);},[inputs]);
 useEffect(()=>setPage(1),[view,sale,search,market,order,lookback,strict,applied,p.watch]);
 const invalid=!Number.isFinite(Number(applied.net))||applied.net===''||Number(applied.net)<1||!strict&&(applied.quiet===''||!Number.isFinite(Number(applied.quiet))||Number(applied.quiet)<=0||Number(applied.quiet)>1)||['cap','latest'].some(k=>{const v=applied[k as 'cap'|'latest'];return v!==''&&(!Number.isFinite(Number(v))||Number(v)<0);});
 const registered=useMemo(()=>invalid?[]:registrations(data?.events??[],lookback,Number(applied.quiet),strict,Number(applied.net)),[data,lookback,applied,strict,invalid]);
 const counts=useMemo(()=>Object.fromEntries(views.map(([v])=>[v,visibleTracking(registered,v,v==='all'||v==='watch'?'all':sale,p.watch).length])),[registered,sale,p.watch]);
 const list=useMemo(()=>visibleTracking(registered,view,sale,p.watch).filter(e=>`${e.name} ${e.code}`.toLowerCase().includes(search.trim().toLowerCase())&&(market==='ALL'||e.market===market)&&(applied.cap===''||e.market_cap!=null&&e.market_cap>=Number(applied.cap)*1e8)&&(Number(applied.latest)===0||e.latest_net!=null&&e.latest_net>=Number(applied.latest)*1e8)).sort((a,b)=>{const key=order.replace('Asc','') as 'signal_date'|'current_return'|'market_cap'|'signal_net'|'latest_net'|'return_5d';const x=order==='score'?buyScore(a).total:a[key],y=order==='score'?buyScore(b).total:b[key];if(x==null)return y==null?a.id.localeCompare(b.id):1;if(y==null)return -1;return (typeof x==='string'&&typeof y==='string'?x.localeCompare(y):Number(x)-Number(y))*(order.endsWith('Asc')?1:-1)||a.id.localeCompare(b.id);}),[registered,view,sale,p.watch,search,market,applied,order,lookback]);
 const pages=Math.max(1,Math.ceil(list.length/20)),safePage=Math.min(page,pages);
 const update=(key:keyof typeof inputs,value:string)=>setInputs(v=>({...v,[key]:value}));
 function presetView(v:View){setView(v);setSale(v==='all'||v==='watch'?'all':'net');setSearch('');setMarket('ALL');const next={...inputs,cap:'',latest:'0'};setInputs(next);setApplied(next);setPage(1);}
 function reset(){setView('new');setSale('net');setSearch('');setMarket('ALL');setOrder('signal_date');setLookback(10);setStrict(false);const next={quiet:'1',net:'3',cap:'',latest:'0'};setInputs(next);setApplied(next);setPage(1);}
 if(loading)return <DataLoading label="신규 순매수 추적 목록을 불러오고 있습니다"/>;
 if(error)return <div className="no-results" role="alert">추적 데이터를 불러오지 못했습니다. {error}</div>;
 return <>
  <div className="explorer-filters entry-filters compact-tracking">
   <div className="filter-top"><h2>신규 순매수 추적</h2><button className="button small" onClick={reset}>조건 초기화</button></div>
   {data?.history_pending&&<p className="notice">3년 전체 이력 갱신을 기다리고 있습니다. 현재 확보된 최근 이력만 표시합니다.</p>}
   {data?.history_available&&<p className="filter-guidance">전체 이력 {data.first_date} ~ {data.as_of} · 최초 등록일은 이 관측 범위에서 처음 조건을 충족한 날짜입니다. 과거 종목 유형은 미검증이며 우선주 등이 포함될 수 있습니다.</p>}
   <p className="entry-description">저거래 이후 큰 순매수가 시작된 종목 · 등록 전 {lookback}거래일 {strict?'매수·매도 모두 0원':`일별 매수·매도 각각 ${applied.quiet}억원 미만`} → 하루 순매수 {applied.net}억원 이상 · 기준일 {p.asOf}</p>
   <div className="quick-filters tracking-views" aria-label="추적 빠른 보기">{views.map(([v,label,description])=><button key={v} aria-pressed={view===v} className={view===v?'active':''} title={description} onClick={()=>presetView(v)}>{label} <span>{counts[v]??0}</span></button>)}</div>
   <p className="filter-guidance">{views.find(([v])=>v===view)?.[2]} · 버튼 종목 수는 등록 조건과 매도 조건 기준이며, 검색·시장·추가 금액 필터 적용 전입니다.</p>
   <div className="basic-filters tracking-basic"><label>종목 검색<input aria-label="사례 종목 검색" value={search} onChange={e=>setSearch(e.target.value)} placeholder="종목명 / 코드"/></label><label>시장<select aria-label="사례 시장" value={market} onChange={e=>setMarket(e.target.value)}><option value="ALL">전체</option><option>KOSPI</option><option>KOSDAQ</option></select></label><label>등록 이후 매도 조건<select aria-label="등록 이후 매도 조건" value={sale} onChange={e=>setSale(e.target.value as Sale)}><option value="net">순매도일 없음</option><option value="gross">매도대금 발생 없음</option><option value="all">전체 · 매도 포함</option></select></label></div>
   <details className="advanced-filters"><summary>등록 조건 · 상세 필터 <small>관찰 기간, 저거래 상한, 등록 순매수 금액</small></summary><div className="advanced-grid tracking-options">
    <label>등록 전 관찰 기간<select aria-label="등록 전 관찰 기간" value={lookback} onChange={e=>setLookback(Number(e.target.value))}><option value={10}>10거래일</option><option value={20}>20거래일</option></select></label>
    <label>일별 매수·매도 각각 미만 (억원)<input aria-label="저거래 상한" type="number" min="0.01" step="0.1" value={inputs.quiet} disabled={strict} onChange={e=>update('quiet',e.target.value)}/></label>
    <label>등록 순매수 최소 (억원)<input aria-label="등록 순매수 최소" type="number" min="1" step="1" value={inputs.net} onChange={e=>update('net',e.target.value)}/></label>
    <label>시가총액 최소 (억원)<input aria-label="사례 시가총액 최소" type="number" min="0" value={inputs.cap} onChange={e=>update('cap',e.target.value)}/></label>
   </div><div className="quick-filters"><span>등록 순매수</span>{[5,3,1].map(n=><button key={n} className={Number(applied.net)===n?'active':''} aria-pressed={Number(applied.net)===n} onClick={()=>{update('net',String(n));setApplied(v=>({...v,net:String(n)}));}}>{n}억원 이상</button>)}<button className={strict?'active':''} aria-pressed={strict} onClick={()=>setStrict(v=>!v)}>엄격한 조건 · 이전 거래 0원</button></div>
   <div className="quick-filters"><span>최근일 순매수 · {p.asOf}</span>{[5,3,1,0].map(n=><button key={n} aria-pressed={Number(applied.latest)===n} className={Number(applied.latest)===n?'active':''} onClick={()=>{update('latest',String(n));setApplied(v=>({...v,latest:String(n)}));}}>{n?`${n}억원 이상`:'전체'}</button>)}</div>
   <p className="filter-guidance">등록 조건 변경 시 신호 목록과 최초 등록일을 다시 계산합니다. 조건을 다시 충족한 신호도 별도 이력으로 남깁니다. 신호 발생일과 종목 최초 등록일을 구분합니다. 과거 이력은 일별 거래 각각 1억원 미만 범위의 조건을 지원합니다. 매도 조건은 등록일 다음 거래일부터 판정합니다. ‘순매도일 없음’은 소액 매도가 있어도 당일 순매수가 양수이면 유지합니다. 응답 미포함 0 처리는 원천 보고 0과 구분하여 표시합니다.</p></details>
   {invalid&&<p role="alert">등록 순매수는 1억원 이상, 저거래 상한은 0보다 큰 값, 시총은 0 이상의 숫자로 입력하세요.</p>}
   {inputs!==applied&&<p className="filter-guidance" role="status">금액 조건 적용 중…</p>}
  </div>
  <ScoreGuide/><div className="results-toolbar"><div><h2>{views.find(([v])=>v===view)?.[1]} <span>{integer(list.length)}건</span></h2><p>전체 신호 {registered.length}건 중 현재 조건 · 20신호씩 표시 · 상단 조회 기간과 별개</p><div className="tracking-condition-summary" aria-label="현재 추적 조건"><span>이전 {lookback}일 {strict?'거래 0원':`거래 각각 ${applied.quiet}억 미만`}</span><span>최초 순매수 ≥ {applied.net}억</span><span>{sale==='net'?'순매도 없음':sale==='gross'?'매도대금 없음':'매도 포함'}</span>{Number(applied.latest)>0&&<span>최근 순매수 ≥ {applied.latest}억</span>}{applied.cap&&<span>시총 ≥ {applied.cap}억</span>}{market!=='ALL'&&<span>{market}</span>}{search&&<span>검색: {search}</span>}</div></div><label className="result-sort">정렬<select aria-label="사례 정렬" value={order} onChange={e=>setOrder(e.target.value)}><option value="signal_date">신호 발생일 최신순 ↓</option><option value="score">매수 관심 스코어 높은 순 ↓</option><option value="current_return">현재 수익률 높은 순 ↓</option><option value="current_returnAsc">현재 수익률 낮은 순 ↑</option><option value="signal_net">최초 순매수 높은 순 ↓</option><option value="latest_net">최근일 순매수 높은 순 ↓</option><option value="market_cap">시총 높은 순 ↓</option><option value="market_capAsc">시총 낮은 순 ↑</option></select></label></div>
  <div className="explorer-table-scroll"><table className="explorer-table entry-table tracking-table"><thead><tr><th>관심</th><th>종목 / 시장</th><th>매수 관심 스코어</th><th>신호 발생일 / 최초 등록일</th><th className="optional-column">최초 순매수 / 등록 후 누적</th><th className="optional-column">최근일 순매수</th><th>등록 후 현재 수익률</th><th>+30% / −10% 최초 도달</th><th className="optional-column">수급 흐름 / 매도 상태</th></tr></thead><tbody>{list.slice((safePage-1)*20,safePage*20).map(e=>{const prior=e.prior[String(lookback)],score=buyScore(e);return <tr key={e.id} tabIndex={0} aria-label={`${e.name} ${e.signal_date} 사례 상세 분석`} className={e.code===p.selected?'selected':''} onClick={ev=>p.open(e.code,ev.currentTarget,e,lookback)} onKeyDown={ev=>{if(ev.target===ev.currentTarget&&(ev.key==='Enter'||ev.key===' ')){ev.preventDefault();p.open(e.code,ev.currentTarget,e,lookback);}}}>
   <td><button className="star" aria-label={`${e.name} 관심 전환`} aria-pressed={p.watch.includes(e.code)} onClick={ev=>{ev.stopPropagation();p.toggle(e.code);}}><Star size={16} fill={p.watch.includes(e.code)?'currentColor':'none'}/></button></td>
   <td><button className="stock-name" onClick={ev=>{ev.stopPropagation();p.open(e.code,ev.currentTarget,e,lookback);}}>{e.name}</button><small>{e.code} · {e.market}</small><ForeignRecordBadge record={e.foreign_record_20}/><small className="tracking-secondary">이전 일평균 거래 {amountLabel(prior?.avg_gross??null)}</small>{!!prior?.absent_days&&<small className="tracking-secondary">응답 미포함 0 처리 {prior.absent_days}/{lookback}일</small>}</td>
   <td className="numeric score-cell">{score.total===null?<strong>자료 부족</strong>:<><strong className="score-value">{score.total}<small>/ 100</small></strong><span className="score-meter" role="meter" aria-label={`${e.name} 매수 관심 스코어`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={score.total}><i style={{width:`${score.total}%`}}/></span></>}<button className="score-detail-link" aria-label={`${e.name} 점수 근거 보기`} onClick={ev=>{ev.stopPropagation();p.open(e.code,ev.currentTarget,e,lookback);}}>점수 근거</button></td><td>{e.signal_date}<small>최초 {e.first_registration_date??e.signal_date}</small><small>{e.tracking_days}거래일 경과</small></td><td className="numeric optional-column">{amountLabel(e.signal_net)}<small>누적 {amountLabel(e.sum_since)}</small></td><td className={`numeric optional-column ${sign(e.latest_net)}`}>{amountLabel(e.latest_net)}<small>{p.asOf}</small></td>
   <td className={`numeric ${sign(e.current_return)}`}>{e.price_comparison?.status==='blocked'?<><span>비교 보류</span><small title={`${e.price_comparison.date??''} ${e.price_comparison.reason??''}`}>기업행사·가격 확인 필요</small><small>최근 종가 {integer(e.current_close)}원</small></>:<>{percentLabel(e.current_return)}<small>{integer(e.signal_close)} → {integer(e.current_close)}원</small></>}</td><td><TouchOutcome event={e}/></td><td className="optional-column"><Spark values={e.spark}/><small>{e.no_net_sale===null?'수급 자료 부족':e.no_net_sale?`순매도 없음 · 매도대금 발생 ${e.gross_sell_days}일`:`순매도 ${e.net_sell_days}일`} · 순매수 {e.buy_days_complete?'':'확인된 '}{e.buy_days}일</small></td>
  </tr>;})}</tbody></table></div>
  {!list.length&&<div className="no-results"><p>현재 조건에 맞는 종목이 없습니다. 전체 이력을 선택하거나 등록 순매수 금액·매도 조건을 완화해 주세요.</p><button className="button" onClick={()=>presetView('all')}>전체 이력 보기</button></div>}
  <div className="table-footer"><span>등록 후 수익률: 등록일 종가 대비 현재 종가. +30%/−10% 도달: 신호 다음 거래일 시가 기준 · 같은 날 양쪽 도달은 손절 우선 가정. 두 날짜는 가상 청산 뒤의 도달도 포함하며 실제 계좌 매매 결과와 다를 수 있습니다. 비용·배당·기업행사 보정 미반영 · 성과는 점수에 사용하지 않음</span><div><button disabled={safePage===1} onClick={()=>setPage(safePage-1)}>이전</button> {safePage}/{pages} <button disabled={safePage===pages} onClick={()=>setPage(safePage+1)}>다음</button></div></div>
 </>;
}

