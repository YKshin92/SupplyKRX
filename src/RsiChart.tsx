import {ResponsiveContainer,LineChart,Line,XAxis,YAxis,ReferenceLine,ReferenceArea,Tooltip,CartesianGrid} from 'recharts';
type Point={date:string;close:number|null;rsi:number|null};
/** Wilder RSI path with the signal zones shaded: below 30 blue, 70 and above red. */
export default function RsiChart({series,compact=false}:{series:Point[];compact?:boolean}){
 return <ResponsiveContainer width="100%" height="100%"><LineChart data={series} margin={{top:6,right:8,left:0,bottom:0}}>
  <ReferenceArea y1={0} y2={30} fill="var(--rsi-low-zone)" fillOpacity={1} stroke="none" ifOverflow="hidden"/>
  <ReferenceArea y1={70} y2={100} fill="var(--rsi-high-zone)" fillOpacity={1} stroke="none" ifOverflow="hidden"/>
  <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 5"/>
  {!compact&&<XAxis dataKey="date" tickFormatter={v=>String(v).slice(5)} tick={{fontSize:10,fill:'var(--muted)'}} minTickGap={24}/>}
  {compact&&<XAxis dataKey="date" hide/>}
  <YAxis domain={[0,100]} ticks={[0,30,70,100]} width={compact?24:30} tick={{fontSize:compact?9:10,fill:'var(--muted)'}}/>
  <Tooltip formatter={(v)=>[typeof v==='number'?v.toFixed(1):'—','RSI']} labelFormatter={l=>String(l)} contentStyle={{fontSize:12}}/>
  <ReferenceLine y={30} stroke="var(--rsi-low-line)" strokeDasharray="4 3"/><ReferenceLine y={70} stroke="var(--rsi-high-line)" strokeDasharray="4 3"/>
  <Line dataKey="rsi" stroke="var(--rsi-line)" strokeWidth={compact?1.5:2} dot={false} connectNulls={false} isAnimationActive={false}/>
 </LineChart></ResponsiveContainer>;
}
