import {Search,Star,X,SlidersHorizontal} from 'lucide-react';
import {emptyScreen,type Screen} from './screener';

type Props={screen:Screen;onChange:(s:Screen)=>void;onCommit:(s:Screen)=>void;days:number;sectors:string[];search:string;setSearch:(s:string)=>void;market:string;setMarket:(s:string)=>void;watchOnly:boolean;setWatchOnly:(v:boolean)=>void;reset:()=>void;problem:string;pending:boolean};
export default function ExplorerFilters(p:Props){
 const {screen,days}=p;
 const update=(key:keyof Screen,value:string)=>p.onChange({...screen,[key]:value});
 const names={net:'최근일 순매수 ≥',days:`${days}일 순매수 일수 ≥`,sellDays:`${days}일 순매도 일수 ≤`,sum:`${days}일 누적 순매수 ≥`,capMin:'시가총액 ≥',capMax:'시가총액 ≤'};
 const input=(key:keyof typeof names,label:string)=><label>{label}<div className="number-field"><input aria-label={label} type="number" min={key==='net'||key==='sum'?undefined:0} max={key==='days'||key==='sellDays'?days:undefined} step={key==='days'||key==='sellDays'?1:'any'} placeholder="제한 없음" value={screen[key]} onChange={e=>update(key,e.target.value)}/><span>{key==='days'||key==='sellDays'?'일':'억원'}</span></div></label>;
 const chips=Object.entries(names).filter(([key])=>screen[key as keyof typeof names]!=='');
 const active=p.search||p.market!=='ALL'||p.watchOnly||chips.length>0||screen.sectors.length>0;
 return <section className="explorer-filters" aria-label="종목 필터">
  <div className="filter-top"><h2><SlidersHorizontal size={17}/>종목 찾기</h2><button className="text-button" onClick={p.reset}>전체 초기화</button></div>
  <div className="basic-filters">
   <label className="search-field">종목 검색<div className="search-box"><Search size={16}/><input aria-label="종목 검색" placeholder="종목명 또는 코드" value={p.search} onChange={e=>p.setSearch(e.target.value)}/>{p.search&&<button aria-label="검색 지우기" onClick={()=>p.setSearch('')}><X size={14}/></button>}</div></label>
   <label>시장<select aria-label="시장" value={p.market} onChange={e=>p.setMarket(e.target.value)}><option value="ALL">전체 시장</option><option>KOSPI</option><option>KOSDAQ</option></select></label>
   {input('net','최근일 순매수 최소')}{input('days',`${days}일 순매수 일수 최소`)}{input('sellDays',`${days}일 순매도 일수 최대`)}
  </div>
  <div className="quick-filters"><span>빠른 조건</span><button title="수급 조건: 최근일 순매수 5억원 이상" onClick={()=>p.onCommit({...emptyScreen,order:screen.order,net:'5'})}>최근일 순매수 5억 이상</button><button title="수급 조건: 순매수일 최소 1일, 순매도일 0일, 선택 기간 전체 자료 확보" onClick={()=>p.onCommit({...emptyScreen,order:screen.order,days:'1',sellDays:'0'})}>{days}일 순매도 없음</button><button aria-pressed={p.watchOnly} className={p.watchOnly?'active':''} onClick={()=>p.setWatchOnly(!p.watchOnly)}><Star size={14}/>관심 종목만</button></div>
  <details className="advanced-filters"><summary>상세 필터 <small>누적 순매수 · 시가총액 · 업종</small></summary><div className="advanced-grid">{input('sum',`${days}일 누적 순매수 최소`)}{input('capMin','시가총액 최소')}{input('capMax','시가총액 최대')}</div><div className="sector-options"><span>업종 · 복수 선택</span>{p.sectors.map(sector=><label key={sector}><input type="checkbox" checked={screen.sectors.includes(sector)} onChange={()=>p.onChange({...screen,sectors:screen.sectors.includes(sector)?screen.sectors.filter(x=>x!==sector):[...screen.sectors,sector]})}/>{sector}</label>)}</div></details>
  {active&&<div className="filter-chips" aria-label="적용 조건">
   {p.search&&<button onClick={()=>p.setSearch('')}>검색: {p.search}<X size={12}/></button>}
   {p.market!=='ALL'&&<button onClick={()=>p.setMarket('ALL')}>{p.market}<X size={12}/></button>}
   {p.watchOnly&&<button onClick={()=>p.setWatchOnly(false)}>관심 종목<X size={12}/></button>}
   {chips.map(([key,label])=><button key={key} onClick={()=>p.onCommit({...screen,[key]:''})}>{label} {screen[key as keyof typeof names]}{key==='days'||key==='sellDays'?'일':'억원'}<X size={12}/></button>)}
   {screen.sectors.map(sector=><button key={sector} onClick={()=>p.onChange({...screen,sectors:screen.sectors.filter(x=>x!==sector)})}>{sector}<X size={12}/></button>)}
  </div>}
  <p className="filter-guidance" role={p.problem?'alert':'status'}>{p.problem|| (p.pending?'숫자 조건 적용 중…':'연기금 기준 · 조건을 모두 충족한 종목 표시 · 0원은 순매수/순매도 일수 제외 · 일수 조건은 기간 전체 자료가 있는 종목에 적용')}</p>
 </section>;
}
