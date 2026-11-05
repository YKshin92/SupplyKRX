import {ResponsiveContainer,ComposedChart,Bar,XAxis,YAxis,Tooltip,CartesianGrid} from 'recharts';
import {Candle} from './ChartPrimitives';
import VolumeChart from './VolumeChart';
import RsiChart,{zoneEntries} from './RsiChart';
import {useMemo,useState} from 'react';
import {rsiTrendlines} from './rsi-trend';
import {TrendNote} from './StockRsiPanel';
import type {RsiPoint} from './rsi-data';
import {priceChange,percentLabel} from './price-change';
import {sign} from './data';

const Y=70;
/** Top-30 row detail: daily candles, volume and a large RSI panel on one shared date axis. */
export default function RsiStockDetail({name,sub,series,currency,onClose}:{name:string;sub:string;series:RsiPoint[];currency:'KRW'|'USD';onClose:()=>void}){
 const money=(v:number|null|undefined)=>v==null?'—':currency==='USD'?`$${v.toFixed(2)}`:`${Math.round(v).toLocaleString('ko-KR')}원`;
 const data=series.map((r,i)=>({...r,wick:r.low!=null&&r.high!=null?[r.low,r.high]:null,previousClose:series[i-1]?.close??null}));
 const z=zoneEntries(series);
 const [trend,setTrend]=useState(false);const lines=useMemo(()=>rsiTrendlines(series),[series]);
 const hasCandles=data.some(r=>r.wick);
 const sync=`rsi-detail-${sub}`;
 return <div className="rsi-stock-detail">
  <div className="rsi-stock-detail-head"><div><strong>{name}</strong><small>{sub} · 최근 {series.length}거래일</small></div><button type="button" className="button small" onClick={onClose}>닫기</button></div>
  <h5>일봉</h5>
  {hasCandles?<div className="rsi-detail-price"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} syncId={sync} margin={{top:8,right:10,left:0,bottom:0}}>
   <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 5"/>
   <XAxis dataKey="date" tickFormatter={v=>String(v).slice(5)} tick={{fontSize:11,fill:'var(--muted)'}} minTickGap={18}/>
   <YAxis domain={['auto','auto']} width={Y} tick={{fontSize:11,fill:'var(--muted)'}} tickFormatter={v=>currency==='USD'?`$${Number(v).toFixed(0)}`:Number(v).toLocaleString('ko-KR')}/>
   <Tooltip content={({active,payload,label})=>{const r=payload?.[0]?.payload as (typeof data)[number]|undefined;if(!active||!r)return null;return <div className="chart-tip"><strong>{label}</strong>{(['open','high','low','close'] as const).map((key,i)=>{const change=priceChange(r[key],r.previousClose);return <div key={key}>{['시가','고가','저가','종가'][i]}: {money(r[key])} <span className={sign(change)}>({percentLabel(change)})</span></div>;})}<div>거래량: {r.volume==null?'—':r.volume.toLocaleString('ko-KR')}주</div><div>RSI: {r.rsi==null?'—':r.rsi.toFixed(1)}</div><small>전 거래일 종가 대비 · 기준가 미확인 시 —</small></div>;}}/>
   <Bar dataKey="wick" name="일봉" shape={<Candle/>} isAnimationActive={false}/>
  </ComposedChart></ResponsiveContainer></div>:<p className="micro-warning">일봉 시가·고가·저가 미수집 · 다음 수집 뒤 표시</p>}
  <h5>거래량</h5>
  <div className="rsi-detail-volume"><VolumeChart data={data} syncId={sync} yWidth={Y} margin={{left:0,right:10}}/></div>
  <h5>RSI(14) <small>Wilder · 30 미만 파랑 · 70 이상 빨강</small> <button type="button" className="button small rsi-trend-toggle" aria-pressed={trend} onClick={()=>setTrend(v=>!v)}>{trend?'추세선 지우기':'추세선 그리기'}</button></h5>
  <div className="rsi-detail-rsi"><RsiChart series={series} syncId={sync} yWidth={Y} trendlines={trend?lines:undefined}/></div>
  {trend&&<TrendNote count={lines.length}/>}
  <p className="rsi-detail-zones"><b className="low">30 미만 진입</b> {z.low.length?z.low.map(d=>d.slice(5)).join(', '):'없음'} <span>(구간 내 {z.lowDays}일)</span> · <b className="high">70 이상 진입</b> {z.high.length?z.high.map(d=>d.slice(5)).join(', '):'없음'} <span>(구간 내 {z.highDays}일)</span></p>
 </div>;
}
