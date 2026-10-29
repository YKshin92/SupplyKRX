import {Fragment,useEffect,useMemo,useState} from 'react';
import {ResponsiveContainer,ComposedChart,Bar,Cell,XAxis,YAxis,CartesianGrid,Tooltip,ReferenceLine} from 'recharts';
import {ArrowDownRight,ArrowUpRight} from 'lucide-react';
import {type Dataset,loadDataset,summarize,amountLabel,amountNumber,amountUnit,integer,sign} from './data';
import {aggregateFlow,periodFlowTotal} from './market-flow';

/** Investors shown in the flow panels and the synced summary cards. Keys are the collector investor names. */
export const STAT_INVESTORS=[['기관합계','기관합계'],['연기금 등','연기금'],['사모','사모']] as const;
export type StatInvestor=typeof STAT_INVESTORS[number][0];
const OTHER_INVESTORS=['외국인','기관합계','사모'];
const UP='var(--flow-up)',DOWN='var(--flow-down)';

/** Loads the other investors' datasets once for both the flow panels and the summary cards. */
export function useInvestorDatasets(dataset:Dataset|null,period:string){
  const [others,setOthers]=useState<Record<string,Dataset>>({});
  const [statuses,setStatuses]=useState<Record<string,string>>({});
  useEffect(()=>{
    if(!dataset)return;
    let cancelled=false;
    setOthers({});setStatuses(Object.fromEntries(OTHER_INVESTORS.map(i=>[i,'불러오는 중…'])));
    for(const investor of OTHER_INVESTORS){
      const task=dataset.local?(investor==='외국인'?Promise.resolve({...dataset,stocks:Object.values(dataset.foreignLocal??{}).filter(rows=>rows.length).map(rows=>summarize([...rows].sort((a,b)=>a.date.localeCompare(b.date)),dataset.manifest.sessions,dataset.manifest.as_of))}):Promise.reject(new Error('가져온 파일에 해당 수급이 없습니다.'))):loadDataset(dataset.manifest.mode==='demo'?'demo':'live',investor,period);
      task.then(d=>{if(cancelled)return;if(d.manifest.as_of!==dataset.manifest.as_of){setStatuses(s=>({...s,[investor]:`기준일 불일치 (${d.manifest.as_of}) · 합산 보류`}));return;}setOthers(s=>({...s,[investor]:d}));setStatuses(s=>({...s,[investor]:d.stocks.length?'':'수급 미수집'}));}).catch(()=>{if(!cancelled)setStatuses(s=>({...s,[investor]:'해당 기간 수급 미확보'}));});
    }
    return()=>{cancelled=true;};
  },[dataset,period]);
  return {others,statuses};
}
export type InvestorDatasets=ReturnType<typeof useInvestorDatasets>;
const sourceFor=(dataset:Dataset,loaded:InvestorDatasets,investor:string)=>investor==='연기금 등'?dataset:loaded.others[investor];

type FlowPoint={date:string;value:number|null;known:number;total:number};
function InvestorFlow({name,data,total,partial,status,selected,onSelect}:{name:string;data:FlowPoint[];total:number|null;partial:boolean;status?:string;selected?:boolean;onSelect?:()=>void}){
  const last=[...data].reverse().find(r=>r.value!=null);
  return <section className={`investor-flow${selected?' selected':''}`} aria-label={`${name} 전체 순매수 흐름`}>
    <div className="investor-flow-heading"><h3>{onSelect?<button type="button" aria-pressed={selected} onClick={onSelect} title="아래 요약 카드를 이 투자자 기준으로 보기">{name} 순매수 흐름</button>:`${name} 순매수 흐름`}</h3>
      <dl className="investor-flow-figures"><div><dt>선택 기간 누적</dt><dd className={sign(total)}>{amountLabel(total)}</dd></div><div><dt>최근일{last?` ${last.date.slice(5)}`:''}</dt><dd className={sign(last?.value??null)}>{amountLabel(last?.value??null)}</dd></div></dl></div>
    <div className="market-flow-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} margin={{top:12,right:20,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--border)"/><XAxis dataKey="date" tickFormatter={v=>v.slice(5)} tick={{fontSize:11}} minTickGap={24} axisLine={false} tickLine={false}/><YAxis width={100} tickFormatter={v=>amountLabel(v)} tick={{fontSize:11}} axisLine={false} tickLine={false}/><ReferenceLine y={0} stroke="#a6b4c6"/><Tooltip content={({active,payload,label})=>{const r=payload?.[0]?.payload as FlowPoint|undefined;return active&&r?<div className="chart-tip"><strong>{label}</strong><div>{name}: {amountLabel(r.value)} ({r.known}/{r.total}종목)</div></div>:null;}}/><Bar dataKey="value" name={name} maxBarSize={22} isAnimationActive={false}>{data.map(r=><Cell key={r.date} fill={(r.value??0)<0?DOWN:UP}/>)}</Bar></ComposedChart></ResponsiveContainer></div>
    <p>{partial?'확인된 날짜·종목만 합산 · ':''}{name==='연기금'?'연기금 등 합산':name==='외국인'?'기타외국인 제외':name==='기관합계'?'연기금·사모 포함':'기관합계의 일부'} · 0 초과 빨강, 0 미만 파랑 · 금액 축 개별 조정{status?` · ${status}`:''}</p>
  </section>;
}

export default function MarketFlow({dataset,loaded,selected,onSelect}:{dataset:Dataset;loaded:InvestorDatasets;selected:StatInvestor;onSelect:(v:StatInvestor)=>void}) {
  const dates=useMemo(()=>aggregateFlow(dataset).map(r=>r.date),[dataset]);
  function panel(investor:string,name:string,select?:StatInvestor){
    const source=sourceFor(dataset,loaded,investor);
    const byDate=new Map(source?aggregateFlow(source).map(r=>[r.date,r]):[]);
    const data=dates.map(date=>({date,value:byDate.get(date)?.net??null,known:byDate.get(date)?.known??0,total:source?.stocks.length??0}));
    const knownDays=data.filter(r=>r.value!=null).length;
    return <InvestorFlow name={name} data={data} total={source?periodFlowTotal(source).net:null} partial={data.some(r=>r.value==null||r.known<r.total)} status={loaded.statuses[investor]||`${knownDays}/${dates.length}거래일 확보`} selected={select!==undefined&&select===selected} onSelect={select===undefined?undefined:()=>onSelect(select)}/>;
  }
  return <section className="market-flow" aria-label="조회 대상 선택 기간 순매수 흐름">
    <div className="market-flow-heading"><div><h2>투자자별 순매수 흐름</h2><p>{dates[0]} ~ {dates.at(-1)} · {dates.length}거래일 · 일별 합계 · 종목 필터와 무관한 데이터셋 전체 기준 · 제목을 누르면 아래 요약 카드가 그 투자자로 바뀝니다</p></div></div>
    <div className="market-flow-panels market-flow-primary">
      {STAT_INVESTORS.map(([key,name])=><Fragment key={key}>{panel(key,name,key)}</Fragment>)}
    </div>
    <details className="market-foreign"><summary>외국인 보조 수급 펼치기</summary>{panel('외국인','외국인')}</details>
    <p className="market-flow-note">기관합계에 연기금·사모가 포함됩니다. 세 금액을 더하지 않습니다. 시장 전체 수급이 아니며, 기간 미수집은 0원으로 추정하지 않습니다.</p>
  </section>;
}

/** Summary cards for one investor, using the same datasets and the same rules as the flow panels. */
export function FlowStats({dataset,loaded,selected,onSelect}:{dataset:Dataset;loaded:InvestorDatasets;selected:StatInvestor;onSelect:(v:StatInvestor)=>void}){
  const m=dataset.manifest;
  const name=STAT_INVESTORS.find(([k])=>k===selected)![1];
  const source=sourceFor(dataset,loaded,selected);
  const total=source?periodFlowTotal(source):null;
  const rows=source?aggregateFlow(source):[];
  const last=[...rows].reverse().find(r=>r.net!==null);
  const status=selected==='연기금 등'?'':loaded.statuses[selected];
  const count=(f:(n:number)=>boolean)=>source?source.stocks.filter(s=>s.net!==null&&f(s.net)).length:null;
  const up=count(n=>n>0),down=count(n=>n<0);
  return <section className="flow-stats" aria-label={`${name} 요약`}>
    <div className="flow-stats-toggle" role="group" aria-label="요약 카드 투자자">{STAT_INVESTORS.map(([k,label])=><button key={k} type="button" aria-pressed={selected===k} onClick={()=>onSelect(k)}>{label}</button>)}{status&&<span className="flow-stats-status">{status}</span>}</div>
    <div className="stats"><article><span>{name} 기간 누적 순매수 <small>{total?.partial?'확인된 값만':`${m.days}거래일`}</small></span><strong className={sign(total?.net??null)}>{amountNumber(total?.net??null)}<em>{amountUnit(total?.net??null)}</em></strong><p>최근일{last?` ${last.date.slice(5)}`:''} 합계 <b className={sign(last?.net??null)}>{amountLabel(last?.net??null)}</b> · {integer(source?.stocks.length??0)}종목 · 시장 전체 아님</p></article><article><span>최근일 {name} 순매수 종목</span><strong>{up??'-'}<em>종목</em><ArrowUpRight size={25} className="positive"/></strong><p>매수금액이 매도금액보다 큰 종목</p></article><article><span>최근일 {name} 순매도 종목</span><strong>{down??'-'}<em>종목</em><ArrowDownRight size={25} className="negative"/></strong><p>매도금액이 매수금액보다 큰 종목</p></article><article><span>수집 범위</span><strong>{m.days}<em>거래일</em></strong><p>{integer(source?.manifest.row_count??m.row_count)}행 · {selected==='기관합계'?'연기금·사모 포함':selected==='사모'?'기관합계의 일부':'연기금 등 합산'}</p></article></div>
  </section>;
}
