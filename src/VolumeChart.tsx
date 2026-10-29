import {ResponsiveContainer,ComposedChart,Bar,XAxis,YAxis,Tooltip,Cell} from 'recharts';
import {compactVolume} from './investor-flow';
import {integer} from './data';
type Bar_={date:string;volume?:number|null;open?:number|null;close?:number|null};
/** Daily volume under the candle chart, sharing its date axis through syncId. */
export default function VolumeChart({data,syncId,yWidth,margin}:{data:Bar_[];syncId:string;yWidth:number;margin:{left:number;right:number}}){
 if(!data.some(r=>r.volume!=null))return <p className="micro-warning">거래량 미수집</p>;
 return <div className="volume-chart" aria-label="일별 거래량"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} syncId={syncId} margin={{top:4,right:margin.right,left:margin.left,bottom:0}}>
  <XAxis dataKey="date" hide/><YAxis width={yWidth} tickFormatter={v=>compactVolume(Number(v))} tick={{fontSize:10,fill:'var(--muted)'}} axisLine={false} tickLine={false} tickCount={3}/>
  <Tooltip cursor={{fill:'transparent'}} formatter={(value)=>[`${integer(typeof value==='number'?value:null)}주`,'거래량']} contentStyle={{background:'var(--sim-surface, #fff)',borderColor:'var(--border)',fontSize:12}}/>
  <Bar dataKey="volume" name="거래량" maxBarSize={16} isAnimationActive={false}>{data.map((r,i)=><Cell key={i} fill={r.open!=null&&r.close!=null&&r.close>=r.open?'#e79aa3':'#8fb5e6'}/>)}</Bar>
 </ComposedChart></ResponsiveContainer></div>;
}
