import {useEffect,useMemo,useState} from 'react';
import {ResponsiveContainer,ComposedChart,Bar,XAxis,YAxis,CartesianGrid,Tooltip,ReferenceLine} from 'recharts';
import {type Dataset,loadDataset,summarize,amountLabel,sign} from './data';
import {aggregateFlow,periodFlowTotal} from './market-flow';

export default function MarketFlow({dataset,period}:{dataset:Dataset;period:string}) {
  const [foreign,setForeign]=useState<Dataset|null>(null);
  const [status,setStatus]=useState('');
  useEffect(()=>{
    let cancelled=false;
    setForeign(null);setStatus('외국인 수급 불러오는 중…');
    const task=dataset.local?Promise.resolve({...dataset,stocks:Object.values(dataset.foreignLocal??{}).filter(rows=>rows.length).map(rows=>summarize([...rows].sort((a,b)=>a.date.localeCompare(b.date)),dataset.manifest.sessions,dataset.manifest.as_of))}):loadDataset(dataset.manifest.mode==='demo'?'demo':'live','외국인',period);
    task.then(d=>{if(!cancelled){setForeign(d);setStatus(d.stocks.length?'':'외국인 수급 미수집');}}).catch(()=>{if(!cancelled)setStatus('외국인 수급을 불러오지 못했습니다.');});
    return()=>{cancelled=true;};
  },[dataset,period]);
  const data=useMemo(()=>{
    const other=new Map(foreign?aggregateFlow(foreign).map(r=>[r.date,r]):[]);
    return aggregateFlow(dataset).map(r=>({date:r.date,pension:r.net,pensionKnown:r.known,pensionTotal:r.total,foreign:other.get(r.date)?.net??null,foreignKnown:other.get(r.date)?.known??0,foreignTotal:other.get(r.date)?.total??0}));
  },[dataset,foreign]);
  const latest=data.at(-1);
  const pensionTotal=periodFlowTotal(dataset);
  const foreignTotal=foreign?periodFlowTotal(foreign):null;
  const partial=data.some(r=>r.pensionKnown<r.pensionTotal||(foreign&&r.foreignKnown<r.foreignTotal));
  return <section className="market-flow" aria-label="조회 대상 선택 기간 순매수 흐름">
    <div className="market-flow-heading"><div><h2>조회 대상 순매수 흐름</h2><p>{data[0]?.date} ~ {latest?.date} · {data.length}거래일 · 일별 순매수 합계 · 종목 필터와 무관한 데이터셋 전체 기준</p></div><div className="market-flow-values"><div><span className="pension-key">연기금</span><strong className={sign(pensionTotal.net)}>{amountLabel(pensionTotal.net)}</strong></div><div><span className="foreign-key">외국인</span><strong className={sign(foreignTotal?.net)}>{amountLabel(foreignTotal?.net)}</strong></div><small>선택 {data.length}거래일 누적 · {partial?'확인된 값 합계':'전체 확인값'}</small></div></div>
    <div className="market-flow-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} margin={{top:12,right:20,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e8edf4"/><XAxis dataKey="date" tickFormatter={v=>v.slice(5)} tick={{fontSize:11}} minTickGap={24} axisLine={false} tickLine={false}/><YAxis width={100} tickFormatter={v=>amountLabel(v)} tick={{fontSize:11}} axisLine={false} tickLine={false}/><ReferenceLine y={0} stroke="#a6b4c6"/><Tooltip content={({active,payload,label})=>{const r=payload?.[0]?.payload as typeof data[number]|undefined;return active&&r?<div className="chart-tip"><strong>{label}</strong><div>연기금: {amountLabel(r.pension)} ({r.pensionKnown}/{r.pensionTotal}종목)</div><div>외국인: {amountLabel(r.foreign)} ({r.foreignKnown}/{r.foreignTotal}종목)</div></div>:null;}}/><Bar dataKey="pension" name="연기금" fill="var(--pension-bar)" maxBarSize={22} radius={[2,2,0,0]} isAnimationActive={false}/><Bar dataKey="foreign" name="외국인" fill="var(--foreign-bar)" maxBarSize={22} radius={[2,2,0,0]} isAnimationActive={false}/></ComposedChart></ResponsiveContainer></div>
    <p className="market-flow-note">연기금 등 합산 · 외국인은 기타외국인 제외 · 시장 전체 수급 아님{partial?' · 일부 날짜는 확인된 종목만 합산':''}{status?` · ${status}`:''}</p>
  </section>;
}
