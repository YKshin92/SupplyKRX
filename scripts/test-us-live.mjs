import test from 'node:test';
import assert from 'node:assert/strict';
import {liveRsi,liveView,isFresh} from '../src/us-live.ts';

test('intraday RSI extends the Wilder averages by one provisional session',()=>{
 const w={date:'2026-11-23',close:100,avg_gain:1.2,avg_loss:0.8,period:14};
 const g=(1.2*13+2)/14,l=(0.8*13)/14;
 assert.ok(Math.abs(liveRsi(w,102)-(100-100/(1+g/l)))<1e-12);
 assert.equal(liveRsi({...w,avg_loss:0},101),100);
 assert.equal(liveRsi({...w,avg_gain:0,avg_loss:0},100),null);
 assert.equal(liveRsi(null,100),null);
});
test('live view ignores quotes for stored sessions and marks provisional entries below 30',()=>{
 const w={date:'2026-11-23',close:100,avg_gain:0.5,avg_loss:1.0,period:14};
 const q=(time,price,fetched=time)=>({symbol:'X',price,open:null,high:null,low:null,prev_close:100,change:null,change_pct:null,time,fetched_at:fetched,source:'Finnhub'});
 assert.equal(liveView(q('2026-11-23T20:59:00Z',99),w,'2026-11-23',35),null);
 const v=liveView(q('2026-11-24T15:00:00Z',97,'2026-11-24T15:00:30Z'),w,'2026-11-23',31);
 assert.equal(v.date,'2026-11-24');assert.ok(Math.abs(v.change_pct+3)<1e-9);assert.ok(v.rsi<30);assert.equal(v.state,'below30');assert.equal(v.entry,true);assert.equal(v.fresh,true);
 const closed=liveView(q('2026-11-24T21:00:00Z',97,'2026-11-24T23:00:00Z'),w,'2026-11-23',31);
 assert.equal(closed.fresh,false);assert.equal(isFresh(q('2026-11-24T21:00:00Z',1,'2026-11-24T21:10:00Z')),true);
 assert.equal(liveView(undefined,w,'2026-11-23',30),null);
 const noW=liveView(q('2026-11-24T15:00:00Z',97),null,'2026-11-23',null);assert.equal(noW.rsi,null);assert.equal(noW.state,null);
});
