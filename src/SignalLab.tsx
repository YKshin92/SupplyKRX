import {useEffect,useMemo,useState} from 'react';
import './signal-lab.css';

type RuleStat={take:number;stop:number;open:number;missing:number;win_rate:number|null;ci:[number,number]|null;avg_return:number|null;avg_days:number|null};
type HorizonStat={count:number;mean:number|null;median:number|null;excess:number|null;positive:number|null};
type Summary={signals:number;entered:number;rules:Record<string,RuleStat>;horizons:Record<string,HorizonStat>};
type Month={month:string;signals:number;take:number;stop:number;win_rate:number|null;excess20:number|null;excess20_count:number};
type Strategy={key:string;label:string;description:string;first_signal:string|null;forward_only:boolean;backtest:Summary;forward:Summary;monthly:Month[]};
type Outcome={status:string;date:string|null;days:number|null;ret:number|null};
type Signal={strategy:string;code:string;name:string;market:string|null;signal_date:string;forward:boolean;entry_date:string|null;entry_price:number|null;status:string;horizons:Record<string,{status:string;ret?:number;excess?:number|null}>;rules:Record<string,Outcome>;rank?:number;score?:number;rsi?:number};
type Lab={schema_version:1;as_of:string;period:{first:string;last:string};rules:{entry:string;horizons:number[];barriers:{name:string;take:number;stop:number}[];cooldown:number;same_day:string;costs:string;universe:string;rsi_settled:number};strategies:Strategy[];recent:Signal[];today:{strategy:string;code:string}[]};

const pct=(v:number|null|undefined,d=1)=>v==null?'—':`${v>0?'+':''}${v.toFixed(d)}%`;
const cls=(v:number|null|undefined)=>v==null?'':v>0?'positive':v<0?'negative':'';
const statusLabel:Record<string,string>={take:'익절',stop:'손절',open:'관찰 중',missing:'가격 단절',waiting:'진입 대기'};

/** 신호 성과 검증: pension / 8-item rank / RSI signals and combinations under one evaluation rule set. */
export default function SignalLab({onOpen}:{onOpen:(code:string)=>void}){
 const [lab,setLab]=useState<Lab|null>(null),[error,setError]=useState('');
 const [rule,setRule]=useState('30/10'),[scope,setScope]=useState<'backtest'|'forward'>('backtest'),[selected,setSelected]=useState('rsi'),[filter,setFilter]=useState('all'),[page,setPage]=useState(1);
 useEffect(()=>{import('./data.ts').then(d=>d.json<Lab>('/data/live/signal-lab/latest.json')).then(d=>{if(!d||d.schema_version!==1||!Array.isArray(d.strategies))throw Error();setLab(d);}).catch(()=>setError('신호 성과 자료를 아직 불러올 수 없습니다.'));},[]);
 const rows=useMemo(()=>(lab?.recent??[]).filter(s=>filter==='all'||s.strategy===filter),[lab,filter]);
 useEffect(()=>setPage(1),[filter]);
 if(error)return <p className="notice">{error}</p>;
 if(!lab)return <div className="chart-empty" role="status">신호 성과를 불러오는 중…</div>;
 const label=Object.fromEntries(lab.strategies.map(s=>[s.key,s.label]));
 const strategy=lab.strategies.find(s=>s.key===selected)??lab.strategies[0];
 const barrier=lab.rules.barriers.find(b=>b.name===rule)!;
 const pages=Math.max(1,Math.ceil(rows.length/25)),current=Math.min(page,pages);
 const maxMonth=Math.max(1,...strategy.monthly.map(m=>m.signals));
 return <section className="signal-lab" aria-label="신호 성과 검증">
  <div className="signal-lab-head"><div><h2>신호 성과 검증</h2><p>세 가지 매수 신호와 조합을 같은 규칙으로 비교합니다 · 기준일 {lab.as_of} · 가격 자료 {lab.period.first}~</p></div>
   <div className="signal-lab-toggles">
    <div role="group" aria-label="익절·손절 기준">{lab.rules.barriers.map(b=><button key={b.name} type="button" aria-pressed={rule===b.name} onClick={()=>setRule(b.name)}>+{b.take}% / −{b.stop}%{b.name==='10/5'?' (RSI 비교용)':''}</button>)}</div>
    <div role="group" aria-label="검증 구분"><button type="button" aria-pressed={scope==='backtest'} onClick={()=>setScope('backtest')}>사후 계산</button><button type="button" aria-pressed={scope==='forward'} onClick={()=>setScope('forward')}>사전 기록</button></div>
   </div></div>
  <p className="signal-lab-scope">{scope==='backtest'?'사후 계산: 지금 규칙을 과거 자료에 적용한 결과입니다. 규칙을 보고 고른 것이라 실제보다 좋게 나올 수 있어 참고용입니다.':'사전 기록: 신호가 나온 날 장 마감 뒤 바꿀 수 없게 기록한 신호만 셉니다. 2026-10-30부터 쌓이며, 진짜 성과는 이 숫자입니다.'}</p>
  <div className="signal-cards">{lab.strategies.map(s=>{const sum=s[scope];const r=sum.rules[rule];const h20=sum.horizons['20'];return <button type="button" key={s.key} className={`signal-card${selected===s.key?' selected':''}`} aria-pressed={selected===s.key} onClick={()=>setSelected(s.key)}>
   <strong>{s.label}</strong><small>{s.description}</small>
   <div className="signal-card-main"><span>승률 <b>{r?.win_rate==null?'—':`${r.win_rate.toFixed(1)}%`}</b></span>{r?.ci&&<em>95% 범위 {r.ci[0]}~{r.ci[1]}%</em>}</div>
   <div className="signal-card-row"><span>신호 {sum.signals}</span><span>익절 {r?.take??0} · 손절 {r?.stop??0} · 관찰 중 {r?.open??0}</span></div>
   <div className="signal-card-row"><span>20일 평균 <b className={cls(h20?.mean)}>{pct(h20?.mean)}</b></span><span>지수 대비 <b className={cls(h20?.excess)}>{pct(h20?.excess)}</b></span></div>
   {s.forward_only&&scope==='backtest'&&<p className="signal-card-note">과거 점수를 다시 만들 수 없어 사전 기록만 집계합니다.</p>}
  </button>;})}</div>

  <div className="signal-detail">
   <h3>{strategy.label} <small>{scope==='backtest'?'사후 계산':'사전 기록'} · +{barrier.take}% / −{barrier.stop}% · 첫 신호 {strategy.first_signal??'—'}</small></h3>
   <div className="table-scroll"><table className="signal-horizon-table"><thead><tr><th>보유 기간</th><th>표본</th><th>평균 수익</th><th>중앙값</th><th>지수 대비 초과</th><th>수익 낸 비율</th></tr></thead><tbody>
    {lab.rules.horizons.map(h=>{const x=strategy[scope].horizons[String(h)];return <tr key={h}><td>{h}거래일</td><td>{x?.count??0}</td><td className={cls(x?.mean)}>{pct(x?.mean,2)}</td><td className={cls(x?.median)}>{pct(x?.median,2)}</td><td className={cls(x?.excess)}>{pct(x?.excess,2)}</td><td>{x?.positive==null?'—':`${x.positive.toFixed(1)}%`}</td></tr>;})}
    {(()=>{const r=strategy[scope].rules[rule];return <tr className="signal-barrier-row"><td>+{barrier.take}% / −{barrier.stop}%</td><td>{(r?.take??0)+(r?.stop??0)}</td><td className={cls(r?.avg_return)}>{pct(r?.avg_return,2)}</td><td colSpan={2}>평균 {r?.avg_days??'—'}거래일 만에 결정 · 가격 단절 {r?.missing??0}</td><td>{r?.win_rate==null?'—':`승률 ${r.win_rate.toFixed(1)}%`}</td></tr>;})()}
   </tbody></table></div>
   <h4>월별 신호 (사후·사전 합계 · +30%/−10% 기준)</h4>
   {strategy.monthly.length?<div className="signal-months">{strategy.monthly.map(mo=><div key={mo.month} className="signal-month" title={`${mo.month} 신호 ${mo.signals} · 익절 ${mo.take} · 손절 ${mo.stop} · 20일 초과 ${pct(mo.excess20,2)}`}>
    <span className="signal-month-bar" style={{height:`${Math.max(4,mo.signals/maxMonth*70)}px`}}/><b>{mo.win_rate==null?'—':`${Math.round(mo.win_rate)}%`}</b><small>{mo.month.slice(2).replace('-','.')}</small></div>)}</div>:<p className="rsi-muted">아직 신호가 없습니다.</p>}
   <p className="source-note">막대 높이는 신호 수, 숫자는 그 달 신호의 승률(+30% 먼저 도달 비율)입니다. 특정 시기에만 잘 맞았는지 확인하는 용도입니다.</p>
  </div>

  <div className="signal-recent">
   <div className="signal-recent-head"><h3>최근 20거래일 신호 <small>{rows.length}건 · 오늘 {lab.today.length}건</small></h3>
    <select aria-label="신호 종류" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">전체 신호</option>{lab.strategies.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
   <div className="table-scroll"><table className="signal-table"><thead><tr><th>신호일</th><th>종목</th><th>신호</th><th>진입(다음날 시가)</th><th>5일</th><th>20일</th><th>+{barrier.take}% / −{barrier.stop}%</th><th>기록</th></tr></thead>
   <tbody>{rows.slice((current-1)*25,current*25).map(s=>{const o=s.rules[rule];return <tr key={`${s.strategy}:${s.code}:${s.signal_date}`} tabIndex={0} onClick={()=>onOpen(s.code)} onKeyDown={e=>{if(e.key==='Enter')onOpen(s.code);}}>
    <td>{s.signal_date}</td><td><strong>{s.name}</strong><small>{s.code} · {s.market??'—'}</small></td><td><span className={`signal-badge ${s.strategy}`}>{label[s.strategy]}</span>{s.rsi!=null&&<small>RSI {s.rsi.toFixed(1)}</small>}{s.rank!=null&&<small>{s.rank}위</small>}</td>
    <td>{s.entry_date?<>{s.entry_date.slice(5)}<small>{s.entry_price?.toLocaleString('ko-KR')}원</small></>:<span className="rsi-muted">{statusLabel[s.status]??s.status}</span>}</td>
    <td className={cls(s.horizons['5']?.ret)}>{s.horizons['5']?.status==='complete'?pct(s.horizons['5'].ret):'—'}</td>
    <td className={cls(s.horizons['20']?.ret)}>{s.horizons['20']?.status==='complete'?pct(s.horizons['20'].ret):'—'}</td>
    <td>{o?<span className={`signal-status ${o.status}`}>{statusLabel[o.status]??o.status}{o.ret!=null?` ${pct(o.ret)}`:''}</span>:'—'}</td>
    <td>{s.forward?<span className="signal-forward">사전 기록</span>:<span className="rsi-muted">사후</span>}</td></tr>;})}</tbody></table></div>
   {!rows.length&&<p className="no-results">최근 신호가 없습니다.</p>}
   <div className="table-footer"><span>행을 누르면 종목 상세(최근 60거래일 일봉·거래량·RSI)가 열립니다</span><span><button disabled={current<=1} onClick={()=>setPage(current-1)}>이전</button> {current}/{pages} <button disabled={current>=pages} onClick={()=>setPage(current+1)}>다음</button></span></div>
  </div>
  <p className="source-note">진입: {lab.rules.entry} · 같은 종목은 신호 뒤 {lab.rules.cooldown}거래일 안의 재신호를 세지 않음 · {lab.rules.same_day} · {lab.rules.costs} · {lab.rules.universe} · RSI 신호는 재시작 뒤 {lab.rules.rsi_settled}거래일 이상 안정화된 값만 · 상승장 구간의 결과는 지수 대비 초과수익과 함께 보세요 · 투자 권유 아님</p>
 </section>;
}
