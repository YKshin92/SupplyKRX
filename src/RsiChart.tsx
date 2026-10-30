import type {Trendline} from './rsi-trend';
import {ResponsiveContainer,LineChart,Line,XAxis,YAxis,ReferenceLine,ReferenceArea,Tooltip,CartesianGrid} from 'recharts';
type Point={date:string;close:number|null;rsi:number|null;cutler?:number|null};
const zone=(v:number|null)=>v==null?null:v<30?'low':v>=70?'high':null;
/** Days on which the RSI moved into a zone (previous session outside it). */
export function zoneEntries(series:Point[]){
 const low:string[]=[],high:string[]=[];
 series.forEach((p,i)=>{const prev=series[i-1];if(!prev||prev.rsi==null||p.rsi==null)return;if(p.rsi<30&&prev.rsi>=30)low.push(p.date);if(p.rsi>=70&&prev.rsi<70)high.push(p.date);});
 return {low,high,lowDays:series.filter(p=>zone(p.rsi)==='low').length,highDays:series.filter(p=>zone(p.rsi)==='high').length};
}
function ZoneDot(props:{cx?:number;cy?:number;payload?:Point}){
 const z=zone(props.payload?.rsi??null);
 if(!z||props.cx==null||props.cy==null)return <g/>;
 return <circle cx={props.cx} cy={props.cy} r={3.5} fill={z==='low'?'var(--rsi-low-line)':'var(--rsi-high-line)'} stroke="var(--surface,#fff)" strokeWidth={1}/>;
}
/** Wilder RSI path with the signal zones shaded (below 30 blue, 70 and above red) and the in-zone days marked. */
export default function RsiChart({series,compact=false,syncId,yWidth,trendlines}:{series:Point[];compact?:boolean;syncId?:string;yWidth?:number;trendlines?:Trendline[]}){
 return <ResponsiveContainer width="100%" height="100%"><LineChart data={series} syncId={syncId} margin={{top:8,right:10,left:0,bottom:0}}>
  <ReferenceArea y1={0} y2={30} fill="var(--rsi-low-zone)" fillOpacity={1} stroke="none" ifOverflow="hidden"/>
  <ReferenceArea y1={70} y2={100} fill="var(--rsi-high-zone)" fillOpacity={1} stroke="none" ifOverflow="hidden"/>
  <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 5"/>
  {!compact&&<XAxis dataKey="date" tickFormatter={v=>String(v).slice(5)} tick={{fontSize:11,fill:'var(--muted)'}} minTickGap={18}/>}
  {compact&&<XAxis dataKey="date" hide/>}
  <YAxis domain={[0,100]} ticks={[0,30,50,70,100]} width={yWidth??(compact?24:32)} tick={{fontSize:compact?9:11,fill:'var(--muted)'}}/>
  <Tooltip content={({active,payload,label})=>{const p=payload?.[0]?.payload as Point|undefined;if(!active||!p)return null;const z=zone(p.rsi);return <div className="chart-tip"><strong>{label}</strong><div>RSI {p.rsi==null?'—':p.rsi.toFixed(1)}{z==='low'?' · 30 미만':z==='high'?' · 70 이상':''}</div>{p.cutler!=null&&<div>Cutler 참고 {p.cutler.toFixed(1)}</div>}{p.close!=null&&<div>종가 {p.close.toLocaleString('ko-KR')}</div>}</div>;}}/>
  <ReferenceLine y={30} stroke="var(--rsi-low-line)" strokeDasharray="4 3"/><ReferenceLine y={70} stroke="var(--rsi-high-line)" strokeDasharray="4 3"/>
  {trendlines?.map((t,i)=><ReferenceLine key={i} segment={[{x:t.from.date,y:t.from.y},{x:t.to.date,y:t.to.y}]} stroke={t.kind==='up'?'var(--rsi-high-line)':'var(--rsi-low-line)'} strokeWidth={1.6} strokeDasharray={t.broken?'5 3':undefined} ifOverflow="hidden"/>)}
  <Line dataKey="rsi" stroke="var(--rsi-line)" strokeWidth={compact?1.5:2} dot={compact?false:<ZoneDot/>} activeDot={{r:4}} connectNulls={false} isAnimationActive={false}/>
 </LineChart></ResponsiveContainer>;
}
