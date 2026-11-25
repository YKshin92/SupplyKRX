import test from 'node:test';
import assert from 'node:assert/strict';
import {weekly,weekKey,cycle,retrace,extend,depth,zone,validSemis,daily,episode,EPISODES} from '../src/semis.ts';

const row=(date,o,h,l,c)=>[date,o,h,l,c,100];
test('log Fibonacci levels match the trader quoted numbers for the 2025 low and 2026 high',()=>{
 const low=49.4367,high=218.65;
 assert.ok(Math.abs(retrace(low,high,0.5)-Math.sqrt(low*high))<1e-9);
 assert.ok(Math.abs(retrace(low,high,0.382)-123.5)<1);
 assert.ok(Math.abs(retrace(low,high,0.5)-103.54)<1);
 assert.ok(Math.abs(retrace(low,high,0.618)-86.81)<1);
 assert.ok(Math.abs(extend(low,high,1.272)-328)<1);
 assert.ok(Math.abs(extend(low,high,2)-970)<5);
 assert.ok(Math.abs(depth(low,high,retrace(low,high,0.382))-0.382)<1e-9);
 assert.equal(zone(0.39),'0.382 ~ 0.5');
});
test('weekly bars group Monday-to-Friday and keep the week high and low',()=>{
 assert.equal(weekKey('2026-11-20'),'2026-11-16');
 const w=weekly([{date:'2026-11-16',open:1,high:2,low:1,close:2},{date:'2026-11-20',open:2,high:5,low:0.5,close:3},{date:'2026-11-23',open:3,high:3,low:3,close:3}]);
 assert.equal(w.length,2);assert.deepEqual(w[0],{date:'2026-11-16',open:1,high:5,low:0.5,close:3});
});
test('cycle finds the 3-year high, the low in the 18 months before it, and the low since',()=>{
 const prices=[row('2023-01-02',10,10,10,10),row('2025-04-07',50,50,49,50),row('2026-06-22',200,218,200,210),row('2026-11-20',125,126,122,124),row('2026-11-23',130,140,129,140)];
 const d={schema_version:1,symbol:'SOXX',name:'x',source:'y',as_of:'2026-11-23',prices:[...Array.from({length:101},(_,i)=>row(`2022-${String(1+i%12).padStart(2,'0')}-01`,5,5,5,5)),...prices]};
 assert.ok(validSemis(d));
 const c=cycle(daily(d).sort((a,b)=>a.date.localeCompare(b.date)));
 assert.deepEqual(c.low,{date:'2025-04-07',price:49});assert.deepEqual(c.high,{date:'2026-06-22',price:218});
 assert.deepEqual(c.lastLow,{date:'2026-11-20',price:122});assert.equal(c.last.price,140);
 assert.equal(validSemis({...d,prices:[[ '2026-11-23',0,1,1,1,1]]}),false);
});
test('episode depth uses the windowed low, peak and trough',()=>{
 const bars=[{date:'2016-02-11',open:9,high:9,low:8,close:9},{date:'2018-03-12',open:21,high:22,low:21,close:21},{date:'2018-12-26',open:16,high:16,low:16,close:16}];
 const e=episode(bars,EPISODES[0]);
 assert.equal(e.low.price,8);assert.equal(e.high.price,22);assert.equal(e.trough.price,16);
 assert.ok(Math.abs(e.depth-Math.log(22/16)/Math.log(22/8))<1e-12);
});
test('live quote replaces or appends the New York session bar and ignores stale quotes',async()=>{
 const {withLive,nyDate}=await import('../src/semis.ts');
 const bars=[{date:'2026-11-20',open:135,high:135,low:122,close:123.4},{date:'2026-11-23',open:142,high:142,low:136,close:140}];
 const q=(time,price)=>({symbol:'SOXX',price,open:141,high:146,low:139,prev_close:140,change:null,change_pct:null,time,fetched_at:time,source:'Finnhub'});
 assert.equal(nyDate('2026-11-24T20:00:00Z'),'2026-11-24');assert.equal(nyDate('2026-11-24T03:00:00Z'),'2026-11-23');
 const a=withLive(bars,q('2026-11-24T15:00:00Z',147));
 assert.equal(a.live,true);assert.equal(a.bars.length,3);assert.deepEqual(a.bars[2],{date:'2026-11-24',open:141,high:147,low:139,close:147});
 const b=withLive(bars,q('2026-11-23T21:00:00Z',140.5));assert.equal(b.bars.length,2);assert.equal(b.bars[1].close,140.5);
 const c=withLive(bars,q('2026-11-20T21:00:00Z',120));assert.equal(c.live,false);assert.equal(c.bars,bars);
 assert.equal(withLive(bars,null).live,false);
});
test('convergence line, breakout and double top are found from bars',async()=>{
 const {convergence,doubleTop,windowRange}=await import('../src/semis.ts');
 const wk=(date,high,close)=>({date,open:close,high,low:close*0.9,close});
 const weeks=[wk('2001-08-06',9,8)];
 for(let y=2002;y<=2010;y++)weeks.push(wk(`${y}-06-03`,5,4));
 weeks.push(wk('2011-02-14',7,6.5));
 for(let m=3;m<=12;m++)weeks.push(wk(`2011-${String(m).padStart(2,'0')}-07`,5,4.5));
 weeks.push(wk('2012-06-04',6,5),wk('2013-05-06',7.5,7.2),wk('2013-06-03',8,7.8));
 const c=convergence(weeks);
 assert.equal(c.from.price,9);assert.equal(c.mid.price,7);assert.equal(c.breakout.date,'2013-05-06');assert.ok(c.to.price<7);
 const bars=[['2026-06-22',218,210,215],['2026-07-29',170,155,160],['2026-10-02',199,190,195],['2026-10-20',180,160,165],['2026-11-05',150,131,140]].map(([date,high,low,close])=>({date,open:close,high,low,close}));
 const d=doubleTop(bars,{date:'2026-06-22',price:218});
 assert.equal(d.second.date,'2026-10-02');assert.equal(d.neck.price,155);assert.deepEqual(d.broken,{date:'2026-11-05',price:140});
 assert.equal(doubleTop(bars.slice(0,1),{date:'2026-06-22',price:218}),null);
 assert.deepEqual(windowRange(bars,'2026-07-01','2026-10-31'),{low:155,high:199});
});
test('stage machine walks correction → rebound → crash → bull → new cycle, and steps back on failure',async()=>{
 const {stages}=await import('../src/semis.ts');
 const bars=[];let day=new Date('2016-01-04T00:00:00Z');
 const push=(price,n=1)=>{for(let k=0;k<n;k++){while([0,6].includes(day.getUTCDay()))day.setUTCDate(day.getUTCDate()+1);bars.push({date:day.toISOString().slice(0,10),open:price,high:price,low:price,close:price});day.setUTCDate(day.getUTCDate()+1);}};
 const until=d=>{while(day.toISOString().slice(0,10)<d)push(bars.at(-1).price??bars.at(-1).close);};
 push(10,5);                       // 2016 seed low 10
 until('2018-06-25');push(20,3);   // 2018 seed high 20 (last bars of the seed window)
 push(15,1);push(15,25);           // −25%: correction low 15, aged
 assert.equal(stages(bars).phase,'correction');assert.ok(Math.abs(stages(bars).confirm-Math.sqrt(300))<1e-9);
 push(18,2);                       // ≥ √(20×15)=17.3 → rebound
 let s=stages(bars);assert.equal(s.phase,'rebound');assert.equal(s.events.at(-1).kind,'rebound');
 push(26,3);push(20,1);            // peak 26 ≥ 20, then −23% → crash
 s=stages(bars);assert.equal(s.phase,'crash');assert.equal(s.reboundPeak.price,26);
 push(16,25);push(21,2);           // crash low 16 aged, ≥ √(26×16)=20.4 → bull
 s=stages(bars);assert.equal(s.phase,'bull');assert.equal(s.low.price,10);
 push(40,3);push(31,1);            // peak 40 > 26, −22.5% → top: new cycle 16 → 40
 s=stages(bars);assert.equal(s.phase,'correction');assert.equal(s.low.price,16);assert.equal(s.high.price,40);assert.equal(s.trough.price,31);
 assert.deepEqual(s.events.map(e=>e.kind),['rebound','crash','bull','top']);assert.equal(s.since,4);
 push(30,25);push(36,2);push(29,1);// rebound confirmed (≥34.6) then new low → back to correction
 s=stages(bars);assert.equal(s.phase,'correction');assert.equal(s.events.at(-1).kind,'rebound_failed');assert.equal(s.trough.price,29);
 push(29,25);push(38,3);push(30,1);// rebound peak 38 < 40, −21% → failed below the high; needs a close above 38 next time
 s=stages(bars);assert.equal(s.phase,'correction');assert.equal(s.failedPeak,38);assert.equal(s.confirm,38);
});
