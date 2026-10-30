import {useEffect,useState} from 'react';
import RsiChart,{zoneEntries} from './RsiChart';
import {readStockRsi,type StockRsi} from './rsi-data';
import './rsi.css';
/** Detail-panel RSI(14) aligned to the price chart's dates (same syncId, one point per chart date). */
export default function StockRsiPanel({code,dates,closes,syncId,yWidth}:{code:string;dates:string[];closes:(number|null)[];syncId:string;yWidth:number}){
 const [data,setData]=useState<StockRsi|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;setData(null);setError('');readStockRsi(code).then(d=>{if(live)setData(d);}).catch(()=>{if(live)setError('RSI 자료 없음 (상장 직후·거래 없음 등)');});return()=>{live=false;};},[code]);
 if(error)return <p className="micro-warning">{error}</p>;
 if(!data)return <div className="chart-empty" role="status">RSI를 불러오는 중…</div>;
 const byDate=new Map(data.series.map(p=>[p.date,p]));
 const series=dates.map((date,i)=>({date,close:closes[i]??null,rsi:byDate.get(date)?.rsi??null,cutler:byDate.get(date)?.cutler??null}));
 const last=[...series].reverse().find(p=>p.rsi!=null);
 const z=zoneEntries(series);
 return <section className="stock-rsi" aria-label="RSI 추세">
  <div className="chart-header"><h3>RSI(14) 추세</h3><span>Wilder · 최근 {dates.length}거래일 · 현재 {last?.rsi==null?'—':last.rsi.toFixed(1)}{last?.cutler!=null?` (Cutler 참고 ${last.cutler.toFixed(1)})`:''}</span></div>
  <div className="stock-rsi-chart"><RsiChart series={series} syncId={syncId} yWidth={yWidth}/></div>
  <p className="rsi-detail-zones"><b className="low">30 미만 진입</b> {z.low.length?z.low.map(d=>d.slice(5)).join(', '):'없음'} <span>(구간 내 {z.lowDays}일)</span> · <b className="high">70 이상 진입</b> {z.high.length?z.high.map(d=>d.slice(5)).join(', '):'없음'} <span>(구간 내 {z.highDays}일)</span></p>
 </section>;
}
