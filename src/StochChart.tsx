import {ResponsiveContainer,LineChart,Line,XAxis,YAxis,Tooltip,CartesianGrid,ReferenceLine,ReferenceArea} from 'recharts';
import {STOCH,stochZone,type StochPoint} from './stochastic';

/** 스토캐스틱 슬로우(5,3,3) under the RSI panel: %K solid, %D dashed, 20 미만 blue band, 80 초과 red band (RSI colours). */
export default function StochChart({points,syncId,yWidth,right=10}:{points:StochPoint[];syncId?:string;yWidth?:number;right?:number}){
 return <ResponsiveContainer width="100%" height="100%"><LineChart data={points} syncId={syncId} margin={{top:8,right,left:0,bottom:0}}>
  <ReferenceArea y1={0} y2={STOCH.low} fill="var(--rsi-low-zone)" fillOpacity={1} stroke="none" ifOverflow="hidden"/>
  <ReferenceArea y1={STOCH.high} y2={100} fill="var(--rsi-high-zone)" fillOpacity={1} stroke="none" ifOverflow="hidden"/>
  <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 5"/>
  <XAxis dataKey="date" scale={syncId?'band':'auto'} tickFormatter={v=>String(v).slice(5)} tick={{fontSize:11,fill:'var(--muted)'}} minTickGap={18}/>
  <YAxis domain={[0,100]} ticks={[0,20,50,80,100]} width={yWidth??32} tick={{fontSize:11,fill:'var(--muted)'}}/>
  <Tooltip content={({active,payload,label})=>{const p=payload?.[0]?.payload as StochPoint|undefined;if(!active||!p)return null;const z=stochZone(p.k);
   return <div className="chart-tip"><strong>{label}</strong><div>%K {p.k==null?'—':p.k.toFixed(1)}{z==='low'?' · 20 미만':z==='high'?' · 80 초과':''}</div><div>%D {p.d==null?'—':p.d.toFixed(1)}</div>{p.k!=null&&p.d!=null&&<small>{p.k>=p.d?'%K가 %D 위':'%K가 %D 아래'}</small>}</div>;}}/>
  <ReferenceLine y={STOCH.low} stroke="var(--rsi-low-line)" strokeDasharray="4 3"/><ReferenceLine y={STOCH.high} stroke="var(--rsi-high-line)" strokeDasharray="4 3"/>
  <Line dataKey="k" name="%K" stroke="var(--rsi-line)" strokeWidth={2} dot={false} activeDot={{r:4}} connectNulls={false} isAnimationActive={false}/>
  <Line dataKey="d" name="%D" stroke="var(--stoch-d-line)" strokeWidth={1.6} strokeDasharray="5 3" dot={false} activeDot={{r:3}} connectNulls={false} isAnimationActive={false}/>
 </LineChart></ResponsiveContainer>;
}
