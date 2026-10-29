import type {RsiPoint} from './rsi-data';
/** Lightweight inline RSI path for table rows: zones below 30 (blue) and 70+ (red) are shaded. */
export default function RsiSpark({series,width=132,height=34}:{series:RsiPoint[];width?:number;height?:number}){
 const y=(v:number)=>height-(v/100)*height;
 const n=series.length;const x=(i:number)=>n<2?0:i/(n-1)*width;
 const parts:string[]=[];let open=false;
 series.forEach((p,i)=>{if(p.rsi==null){open=false;return;}parts.push(`${open?'L':'M'}${x(i).toFixed(1)},${y(p.rsi).toFixed(1)}`);open=true;});
 return <svg className="rsi-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="최근 RSI 흐름">
  <rect x={0} y={y(100)} width={width} height={y(70)-y(100)} fill="var(--rsi-high-zone)"/>
  <rect x={0} y={y(30)} width={width} height={y(0)-y(30)} fill="var(--rsi-low-zone)"/>
  <path d={parts.join('')} fill="none" stroke="var(--rsi-line)" strokeWidth={1.4}/>
 </svg>;
}
