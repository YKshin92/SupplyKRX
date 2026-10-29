import {useEffect,useState} from 'react';
import {ResponsiveContainer,LineChart,Line,XAxis,YAxis,ReferenceLine,Tooltip,CartesianGrid} from 'recharts';
import {readRsi,stateLabel,type RsiData} from './rsi-data';
import './rsi.css';
/** 시장 현황: KOSPI/KOSDAQ Cutler RSI(14) state and recent path. */
export default function IndexRsi(){
 const [data,setData]=useState<RsiData|null>(null),[error,setError]=useState('');
 useEffect(()=>{readRsi().then(setData).catch(()=>setError('지수 RSI 자료를 아직 불러올 수 없습니다.'));},[]);
 if(error)return <p className="notice">{error}</p>;
 if(!data)return <div className="chart-empty rsi-loading" role="status">지수 RSI를 불러오는 중…</div>;
 return <section className="index-rsi" aria-label="지수 RSI">
  <div className="rsi-title"><h3>지수 RSI <small>Cutler 14일 · 단순이동평균</small></h3><span>기준일 {data.as_of}</span></div>
  <div className="index-rsi-grid">{['KOSPI','KOSDAQ'].map(name=>{const x=data.indices[name];if(!x)return <article key={name}><strong>{name}</strong><p>지수 자료 없음</p></article>;const s=x.summary;return <article key={name} className={s.state??''}>
   <div className="index-rsi-head"><strong>{name}</strong>{s.entry_today&&<span className="rsi-event">오늘 30 하향 진입</span>}</div>
   <div className="index-rsi-value"><b>{s.rsi==null?'—':s.rsi.toFixed(1)}</b><span>{stateLabel(s.state)}</span><small>전일 {s.prev_rsi==null?'—':s.prev_rsi.toFixed(1)}{s.last_entry_date?` · 최근 30 하향 진입 ${s.last_entry_date}`:''}</small></div>
   <div className="index-rsi-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={x.series} margin={{top:6,right:8,left:0,bottom:0}}><CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 5"/><XAxis dataKey="date" tickFormatter={v=>String(v).slice(5)} tick={{fontSize:10,fill:'var(--muted)'}} minTickGap={24}/><YAxis domain={[0,100]} ticks={[0,30,70,100]} width={30} tick={{fontSize:10,fill:'var(--muted)'}}/><Tooltip formatter={(v)=>[typeof v==='number'?v.toFixed(1):'—','RSI']} contentStyle={{fontSize:12}}/><ReferenceLine y={30} stroke="#4284d8" strokeDasharray="4 3"/><ReferenceLine y={70} stroke="#cd4e60" strokeDasharray="4 3"/><Line dataKey="rsi" stroke="var(--pension-bar, #2969c7)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false}/></LineChart></ResponsiveContainer></div>
  </article>;})}</div>
  <p className="source-note">원 종가 기준 · 직전 14거래일 상승폭·하락폭을 단순평균(Cutler) · 기존 로컬 연구의 Wilder 방식과 다릅니다 · 결측·가격 단절 뒤에는 다시 15거래일을 모아 계산 · 투자 권유 아님</p>
 </section>;
}
