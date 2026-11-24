import test from 'node:test';
import assert from 'node:assert/strict';
import {stochastic,stochEvents,stochZone} from '../src/stochastic.ts';

const bar=(i,high,low,close)=>({date:`2026-01-${String(i+1).padStart(2,'0')}`,high,low,close});
test('slow stochastic 5,3,3 matches a hand calculation',()=>{
 const raw=[[10,8,9],[11,9,10],[12,10,11],[11,9,9.5],[13,10,12],[14,11,13],[13,11,12],[12,10,10.5],[11,9,9.5],[12,10,11.5],[13,11,12.5]];
 const bars=raw.map(([h,l,c],i)=>bar(i,h,l,c));
 const fast=bars.map((b,i)=>{if(i<4)return null;const w=bars.slice(i-4,i+1);const hh=Math.max(...w.map(x=>x.high)),ll=Math.min(...w.map(x=>x.low));return (b.close-ll)/(hh-ll)*100;});
 const k=fast.map((_,i)=>i<6?null:(fast[i]+fast[i-1]+fast[i-2])/3);
 const d=k.map((_,i)=>i<8?null:(k[i]+k[i-1]+k[i-2])/3);
 const s=stochastic(bars);
 assert.equal(s.length,bars.length);
 for(let i=0;i<bars.length;i++){
  if(k[i]==null)assert.equal(s[i].k,null);else assert.ok(Math.abs(s[i].k-k[i])<1e-9,`k ${i}`);
  if(d[i]==null)assert.equal(s[i].d,null);else assert.ok(Math.abs(s[i].d-d[i])<1e-9,`d ${i}`);
 }
 assert.ok(Math.abs(fast[4]-(12-8)/(13-8)*100)<1e-12);
});
test('missing high/low or a flat window gives no value, never a filled one',()=>{
 const bars=Array.from({length:16},(_,i)=>bar(i,10+i,8+i,9+i));
 bars[5]={...bars[5],high:null};
 const s=stochastic(bars);
 assert.equal(s[5].k,null);assert.equal(s[11].k,null);assert.notEqual(s[12].k,null);
 assert.ok(stochastic(Array.from({length:10},(_,i)=>bar(i,5,5,5))).every(p=>p.k==null));
});
test('zone entries and the latest %K/%D cross',()=>{
 const p=(i,k,d)=>({date:`d${i}`,k,d});
 const e=stochEvents([p(0,null,null),p(1,30,40),p(2,15,30),p(3,10,20),p(4,25,15),p(5,85,40),p(6,90,70),p(7,70,80)]);
 assert.deepEqual(e.low,['d2']);assert.deepEqual(e.high,['d5']);assert.equal(e.lowDays,2);assert.equal(e.highDays,2);
 assert.deepEqual(e.cross,{date:'d7',kind:'dead',k:70});
 assert.equal(stochZone(10),'low');assert.equal(stochZone(50),'mid');assert.equal(stochZone(81),'high');assert.equal(stochZone(null),null);
});
