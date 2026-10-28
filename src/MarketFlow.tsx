import {useEffect,useMemo,useState} from 'react';
import {ResponsiveContainer,ComposedChart,Bar,XAxis,YAxis,CartesianGrid,Tooltip,ReferenceLine} from 'recharts';
import {type Dataset,loadDataset,summarize,amountLabel,sign} from './data';
import {aggregateFlow,periodFlowTotal} from './market-flow';

type FlowPoint={date:string;value:number|null;known:number;total:number};
function InvestorFlow({name,color,data,total,partial,status}:{name:string;color:string;data:FlowPoint[];total:number|null;partial:boolean;status?:string}){
  return <section className="investor-flow" aria-label={`${name} 전체 순매수 흐름`}>
    <div className="investor-flow-heading"><h3>{name} 순매수 흐름</h3><div><span>선택 기간 누적</span> <strong className={sign(total)}>{amountLabel(total)}</strong></div></div>
    <div className="market-flow-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} margin={{top:12,right:20,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--border)"/><XAxis dataKey="date" tickFormatter={v=>v.slice(5)} tick={{fontSize:11}} minTickGap={24} axisLine={false} tickLine={false}/><YAxis width={100} tickFormatter={v=>amountLabel(v)} tick={{fontSize:11}} axisLine={false} tickLine={false}/><ReferenceLine y={0} stroke="#a6b4c6"/><Tooltip content={({active,payload,label})=>{const r=payload?.[0]?.payload as FlowPoint|undefined;return active&&r?<div className="chart-tip"><strong>{label}</strong><div>{name}: {amountLabel(r.value)} ({r.known}/{r.total}종목)</div></div>:null;}}/><Bar dataKey="value" name={name} fill={color} maxBarSize={22} radius={[2,2,0,0]} isAnimationActive={false}/></ComposedChart></ResponsiveContainer></div>
    <p>{partial?'확인된 날짜·종목만 합산 · ':''}{name==='연기금'?'연기금 등 합산':name==='외국인'?'기타외국인 제외':name==='기관합계'?'연기금·사모 포함':'기관합계의 일부'} · 금액 축 개별 조정{status?` · ${status}`:''}</p>
  </section>;
}

export default function MarketFlow({dataset,period}:{dataset:Dataset;period:string}) {
  const [others,setOthers]=useState<Record<string,Dataset>>({});
  const [statuses,setStatuses]=useState<Record<string,string>>({});
  useEffect(()=>{
    let cancelled=false;
    setOthers({});setStatuses(Object.fromEntries(['외국인','기관합계','사모'].map(i=>[i,'불러오는 중…'])));
    for(const investor of ['외국인','기관합계','사모']){
      const task=dataset.local?(investor==='외국인'?Promise.resolve({...dataset,stocks:Object.values(dataset.foreignLocal??{}).filter(rows=>rows.length).map(rows=>summarize([...rows].sort((a,b)=>a.date.localeCompare(b.date)),dataset.manifest.sessions,dataset.manifest.as_of))}):Promise.reject(new Error('가져온 파일에 해당 수급이 없습니다.'))):loadDataset(dataset.manifest.mode==='demo'?'demo':'live',investor,period);
      task.then(d=>{if(cancelled)return;if(d.manifest.as_of!==dataset.manifest.as_of){setStatuses(s=>({...s,[investor]:`기준일 불일치 (${d.manifest.as_of}) · 합산 보류`}));return;}setOthers(s=>({...s,[investor]:d}));setStatuses(s=>({...s,[investor]:d.stocks.length?'':'수급 미수집'}));}).catch(()=>{if(!cancelled)setStatuses(s=>({...s,[investor]:'해당 기간 수급 미확보'}));});
    }
    return()=>{cancelled=true;};
  },[dataset,period]);
  const dates=useMemo(()=>aggregateFlow(dataset).map(r=>r.date),[dataset]);
  function panel(investor:string,name:string,color:string){
    const source=investor==='연기금 등'?dataset:others[investor];
    const byDate=new Map(source?aggregateFlow(source).map(r=>[r.date,r]):[]);
    const data=dates.map(date=>({date,value:byDate.get(date)?.net??null,known:byDate.get(date)?.known??0,total:source?.stocks.length??0}));
    const knownDays=data.filter(r=>r.value!=null).length;
    return <InvestorFlow name={name} color={color} data={data} total={source?periodFlowTotal(source).net:null} partial={data.some(r=>r.value==null||r.known<r.total)} status={statuses[investor]||`${knownDays}/${dates.length}거래일 확보`}/>;
  }
  return <section className="market-flow" aria-label="조회 대상 선택 기간 순매수 흐름">
    <div className="market-flow-heading"><div><h2>투자자별 순매수 흐름</h2><p>{dates[0]} ~ {dates.at(-1)} · {dates.length}거래일 · 일별 합계 · 종목 필터와 무관한 데이터셋 전체 기준</p></div></div>
    <div className="market-flow-panels market-flow-primary">
      {panel('기관합계','기관합계','#9275e8')}
      {panel('연기금 등','연기금','var(--pension-bar)')}
      {panel('사모','사모','#20a68a')}
    </div>
    <details className="market-foreign"><summary>외국인 보조 수급 펼치기</summary>{panel('외국인','외국인','var(--foreign-bar)')}</details>
    <p className="market-flow-note">기관합계에 연기금·사모가 포함됩니다. 세 금액을 더하지 않습니다. 시장 전체 수급이 아니며, 기간 미수집은 0원으로 추정하지 않습니다.</p>
  </section>;
}
