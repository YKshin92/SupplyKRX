import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runSimulation} from '../src/simulation-engine.ts';
const price=(o=100,h=105,l=95,c=100)=>({open:o,high:h,low:l,close:c,volume:100,change_pct:null});
const sessions=['2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-07'];
const candidate=(code,score,prices)=>({code,name:code,market:'KOSPI',signals:[{index:0,net:3e8,score,absent:0}],prices});
const input=(stocks)=>({version:1,sessions,stocks,indices:{KOSPI:sessions.map(()=>price())},source:{}});
const settings={mode:'capital',initial:300,budget:300,take:30,stop:10,start:sessions[0]};
// Currency range validation applies to real won inputs, so scale the small fixture.
const scale=10000;
function run(stocks,overrides={}){const d=input(stocks.map(c=>({...c,prices:c.prices.map(p=>p&&Object.fromEntries(Object.entries(p).map(([k,v])=>[k,['open','high','low','close'].includes(k)&&v!=null?v*scale:v])))})));return runSimulation(d,{...settings,initial:300*scale,budget:300*scale,...overrides});}
test('score priority, no same-day reuse, queued later entry',()=>{const a=candidate('A',90,[price(),price(100,135,95,130),price(),price(),price()]);const b=candidate('B',70,sessions.map(()=>price()));const r=run([a,b]);assert.equal(r.trades[0].entry_date,sessions[1]);assert.equal(r.trades[0].status,'take');assert.equal(r.trades[1].entry_date,sessions[2]);assert.equal(r.trades[1].wait_days,1);assert.ok(r.ledger.every(d=>d.end_cash>=0));});
test('both thresholds use stop first; opening gaps fill at open',()=>{let r=run([candidate('A',90,[price(),price(100,135,85,100),price(),price(),price()])]);assert.equal(r.trades[0].status,'stop');assert.equal(r.trades[0].return_pct,-9.999999999999998);r=run([candidate('A',90,[price(),price(),price(85,95,80,90),price(),price()])]);assert.equal(r.trades[0].exit_price,85*scale);});
test('missing held prices keep capital locked and NAV unknown',()=>{const r=run([candidate('A',90,[price(),price(),null,price(),price()])]);assert.equal(r.account.equity,null);assert.equal(r.trades[0].status,'unresolved');assert.equal(r.account.cash,0);});
test('start within period selects later first signal without carrying positions',()=>{const c=candidate('A',90,sessions.map(()=>price()));c.signals.push({index:2,net:3e8,score:80,absent:0});const r=run([c],{start:sessions[1]});assert.equal(r.trades[0].signal_date,sessions[2]);assert.equal(r.trades[0].entry_date,sessions[3]);});
test('future daily high cannot affect opening purchase priority',()=>{const a=candidate('A',90,[price(),price(100,90,95,100),price(),price(),price()]),b=candidate('B',70,sessions.map(()=>price()));const r=run([a,b]);assert.equal(r.trades[0].entry_date,sessions[1]);assert.equal(r.trades[0].status,'unresolved');assert.equal(r.trades[1].entry_date,null);});
test('missing score is not ranked; no holdings is flat cash',()=>{const r=run([candidate('A',null,sessions.map(()=>price()))]);assert.equal(r.summary.bought,0);assert.equal(r.account.equity,300*scale);assert.equal(r.trades[0].status,'score_missing');});
test('repeat signals permit reentry after exit but never pyramid',()=>{
 const c=candidate('A',90,[price(),price(),price(100,135,95,130),price(),price()]);
 c.signals.push({index:1,net:3e8,score:90,absent:0},{index:3,net:3e8,score:90,absent:0},{index:3,net:3e8,score:90,absent:0});
 const r=run([c]);assert.equal(r.trades.length,3);assert.deepEqual(r.trades.map(t=>t.status),['take','skipped','open']);
 assert.equal(r.trades[2].entry_date,sessions[4]);assert.equal(r.account.max_holdings,1);
 assert.equal(new Set(r.trades.map(t=>t.event_id)).size,3);
});
test('research conditions use supplied signal-time features and preserve the base strategy',()=>{
 const c=candidate('A',90,sessions.map(()=>price()));c.signals[0].quiet_3m=true;c.signals[0].volume_ratio_20=4;
 assert.equal(run([c]).trades.length,1);assert.equal(run([c],{filter:'quiet3m'}).trades.length,1);
 assert.equal(run([c],{filter:'quiet3m-volume'}).trades.length,0);
});
if(process.env.SIMULATION_PARITY==='1')test('real private data matches Python reference across settings',()=>{
 const data=JSON.parse(fs.readFileSync('public/data/live/simulation-input.json','utf8')),fixtures=JSON.parse(fs.readFileSync('work/simulation-parity.json','utf8'));
 const close=(a,b,label)=>assert.ok(a==null&&b==null||typeof a==='number'&&typeof b==='number'&&Math.abs(a-b)<1e-5,`${label}: ${a} != ${b}`);
 for(const f of fixtures){const r=runSimulation(data,f.settings);assert.equal(r.trades.length,f.trades.length);for(const t of r.trades){const p=f.trades.find(p=>p.code===t.code);assert.ok(p);for(const k of ['status','signal_date','entry_date','exit_date','shares','trading_days','calendar_days'])assert.equal(t[k],p[k],`${t.code} ${k}`);for(const k of ['invested','pnl','return_pct','entry_price','exit_price'])close(t[k],p[k],`${t.code} ${k}`);for(const h of [5,10,20]){assert.equal(t.horizons[h].status,p.horizons[h].status);close(t.horizons[h].stock,p.horizons[h].stock_return,'horizon');}}
 if(f.account)for(const k of ['cash','equity','pnl','return_pct'])close(r.account[k],f.account[k],k);close(r.summary.invested,f.summary.invested,'invested');close(r.benchmark.pnl,f.benchmark.index_pnl,'benchmark');}
});

test('optional pension net-sell exit sells at the next open only when switched on and larger than the signal buy',()=>{
 const c=candidate('A',90,[price(),price(),price(104,106,101,105),price(),price()]);
 c.sells=[[1,3.5e8]];  // entry day: 연기금 net sell 3.5억 > signal-day net buy 3억
 let r=run([c]);assert.equal(r.trades[0].status,'open');
 r=run([c],{flowExit:true});assert.equal(r.trades[0].status,'flow');assert.equal(r.trades[0].exit_date,sessions[2]);
 assert.equal(r.trades[0].exit_price,104*scale);assert.equal(r.summary.flow,1);assert.equal(r.account.cash,3*104*scale);
 c.sells=[[1,2.9e8]];r=run([c],{flowExit:true});assert.equal(r.trades[0].status,'open');  // smaller than the signal buy: keep
});

test('percent sizing buys a share of the previous close equity, fixed within the day',()=>{
 const a=candidate('A',90,sessions.map(()=>price())),b=candidate('B',70,sessions.map(()=>price()));
 let r=run([a,b]);assert.equal(r.trades[0].shares,3);assert.equal(r.trades[1].entry_date,null);  // fixed 300: B waits
 r=run([a,b],{sizing:'percent',percent:34});  // 34% of 300 = 102 -> one 100 share each, same day
 assert.deepEqual(r.trades.map(t=>[t.entry_date,t.shares]),[[sessions[1],1],[sessions[1],1]]);
 // compounding: A closes day 1 at +20%, so B (signal day 1, bought day 2) sizes from 300 - 120 + 144 = 324 equity
 const c=candidate('A',90,[price(10,10.5,9.5,10),price(10,12.5,9.5,12),price(12,12.5,11.5,12),price(12,12.5,11.5,12),price(12,12.5,11.5,12)]);
 const d={...candidate('B',70,sessions.map(()=>price(5,5.2,4.8,5))),signals:[{index:1,net:3e8,score:70,absent:0}]};
 r=run([c,d],{sizing:'percent',percent:40});
 assert.equal(r.trades.find(t=>t.code==='A').shares,12);assert.equal(r.trades.find(t=>t.code==='B').shares,25);  // 0.4*324=129.6 -> 25 x 5
 assert.throws(()=>run([c],{sizing:'percent',percent:0}),/1~100%/);
});
test('minimum order: uses the remaining cash down to the minimum, and lifts a smaller target up to it',()=>{
 const a=candidate('A',90,sessions.map(()=>price())),b=candidate('B',70,sessions.map(()=>price()));
 const four={initial:400*scale};  // A takes 300, 100 cash left
 assert.equal(run([a,b],four).trades[1].entry_date,null);  // no minimum: wait for the full 300
 let r=run([a,b],{...four,minBuy:100*scale});assert.equal(r.trades[1].entry_date,sessions[1]);assert.equal(r.trades[1].invested,100*scale);
 r=run([a,b],{...four,minBuy:150*scale});assert.equal(r.trades[1].entry_date,null);assert.match(r.trades[1].reason,/최소 매수금액/);
 r=run([a],{sizing:'percent',percent:10});assert.equal(r.trades[0].entry_date,null);  // 10% of 300 = 30 < one 100 share
 r=run([a],{sizing:'percent',percent:10,minBuy:100*scale});assert.equal(r.trades[0].shares,1);  // lifted to the 100 minimum
});
test('costs: buy fee joins the cost basis, sell cost comes off the proceeds, cash stays consistent',()=>{
 const a=candidate('A',90,[price(),price(100,135,95,130),price(),price(),price()]);
 const r=run([a],{costs:{buy:0.1,sell:0.3}});const t=r.trades[0];
 assert.equal(t.shares,2);assert.equal(t.invested,2*100*scale*1.001);  // 300 budget / (100 x 1.001) -> 2 shares
 const proceeds=2*130*scale*(1-0.003);assert.ok(Math.abs(t.pnl-(proceeds-t.invested))<1e-3);
 assert.ok(Math.abs(r.account.cash-(300*scale-t.invested+proceeds))<1e-3);
 assert.equal(run([a]).trades[0].shares,3);  // without costs: unchanged
});
test('a held stock whose prices end for good is settled at its last close; a short gap stays unresolved',()=>{
 const days=['2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-07','2026-09-08','2026-09-09','2026-09-10','2026-09-11','2026-09-14'];
 const mk=(prices)=>({version:1,sessions:days,stocks:[{code:'A',name:'A',market:'KOSPI',signals:[{index:0,net:3e8,score:90,absent:0}],prices}],indices:{KOSPI:days.map(()=>price())},source:{}});
 const p=(c)=>({open:100*scale,high:105*scale,low:95*scale,close:c*scale,volume:100,change_pct:null});
 let r=runSimulation(mk([p(100),p(100),p(104),null,null,null,null,null,null,null]),{...settings,initial:300*scale,budget:300*scale});
 assert.equal(r.trades[0].status,'delisted');assert.equal(r.trades[0].exit_date,'2026-09-03');assert.equal(r.trades[0].exit_price,104*scale);assert.equal(r.account.cash,300*scale+3*4*scale);
 r=runSimulation(mk([p(100),p(100),p(104),null,p(103),p(103),p(103),p(103),p(103),p(103)]),{...settings,initial:300*scale,budget:300*scale});
 assert.equal(r.trades[0].status,'unresolved');  // prices come back: not a delisting
});
test('idle cash: deposit accrues on cash by calendar days; index cash follows KOSPI open/close around the buys',()=>{
 const a=candidate('A',90,sessions.map(()=>price()));
 const base=run([a],{initial:400*scale}).account.equity;   // 300 in A, 100 cash
 const dep=run([a],{initial:400*scale,idle:{kind:'deposit',rate:0.1}}).account.equity;
 const days=(Date.parse(sessions.at(-1))-Date.parse(sessions[0]))/864e5;assert.ok(dep>base&&dep<base+400*scale*(Math.pow(1.1,days/365)-1)+1);
 const d=input([a]);d.stocks[0].prices=d.stocks[0].prices.map(p=>({...p,open:p.open*scale,high:p.high*scale,low:p.low*scale,close:p.close*scale}));
 d.indices.KOSPI=sessions.map((x,i)=>({open:100*(1+i*0.01),high:110,low:90,close:100*(1+i*0.01)}));  // +1% per day, open = close
 const r=runSimulation(d,{...settings,initial:400*scale,budget:300*scale,idle:{kind:'index'}});
 // day 0 close -> day 1 open: 400 * 1.01, minus 300 bought at the open, then +0% open->close on day 1, ...
 assert.ok(r.account.cash>100*scale);assert.ok(Math.abs(r.ledger[0].end_cash-400*scale)<1e-6);
});
test('idle ETF: open buys sell the ETF for the shortfall, spare cash buys at the open, sale proceeds buy at the close',()=>{
 const a=candidate('A',90,[price(),price(),price(100,135,95,130),price(),price()]);
 const d=input([a]);d.stocks[0].prices=d.stocks[0].prices.map(p=>({...p,open:p.open*scale,high:p.high*scale,low:p.low*scale,close:p.close*scale}));
 const bar=(o,c)=>({open:o,high:Math.max(o,c),low:Math.min(o,c),close:c});
 d.indices.ETF=[bar(100,100),bar(110,110),bar(120,120),bar(125,130),bar(130,130)];
 const at=(o)=>({...settings,initial:400*scale,budget:300*scale,idle:{kind:'index',series:'ETF',...o}});
 // day 0: 400 -> 4 units at 100. day 1: sell 300/110 units for the buy. day 2: take at 130 -> 390 buys at the close 120.
 let units=4-300/110+390/120,r=runSimulation(d,at({}));
 assert.ok(Math.abs(r.account.equity-units*130*scale)<1e-3);assert.equal(r.trades[0].status,'take');
 assert.ok(Math.abs(r.ledger[1].end_cash-(4-300/110)*110*scale)<1e-3);
 // next-open: the 390 waits as cash and buys at day 3's open 125.
 units=4-300/110+390/125;r=runSimulation(d,at({reinvest:'next-open'}));assert.ok(Math.abs(r.account.equity-units*130*scale)<1e-3);
 // 1% fee each way and 10% tax on the sale gain over the average price.
 r=runSimulation(d,at({fee:1,gainTax:10}));
 let u=400/(100*1.01);const liq=110*.99-.1*(110-100),sold=300/liq;u-=sold;const avg=100;u+=390/(120*1.01);
 assert.ok(Math.abs(r.account.equity-u*130*scale)<1e-3);
 assert.ok(Math.abs(r.account.idle_taxes-sold*scale*.1*10)<1e-3);
 assert.ok(Math.abs(r.account.idle_fees-(400*scale-400*scale/1.01+sold*scale*110*.01+390*scale-390*scale/1.01))<1e-3);
 assert.throws(()=>runSimulation(d,at({series:'NONE'})),/데이터가 없습니다/);
});
test('idle ETF basket: equal amounts in, same fraction of each out, per-series gain tax',()=>{
 const a=candidate('A',90,[price(),price(),price(100,135,95,130),price(),price()]);
 const d=input([a]);d.stocks[0].prices=d.stocks[0].prices.map(p=>({...p,open:p.open*scale,high:p.high*scale,low:p.low*scale,close:p.close*scale}));
 const bar=(o,c)=>({open:o,high:Math.max(o,c),low:Math.min(o,c),close:c});
 d.indices.X=[bar(100,100),bar(120,120),bar(120,120),bar(120,120),bar(120,120)];
 d.indices.Y=[bar(50,50),bar(40,40),bar(40,40),bar(40,40),bar(40,40)];
 const r=runSimulation(d,{...settings,initial:400*scale,budget:300*scale,idle:{kind:'index',series:['X','Y'],gainTax:[0,10]}});
 // day 0: 200 each -> 2 X, 4 Y. day 1: X 240 + Y 160 = 400, sell 3/4 of each for the 300 buy (Y at a loss: no tax).
 let x=2*.25,y=4*.25;assert.ok(Math.abs(r.ledger[1].end_cash-(x*120+y*40)*scale)<1e-3);assert.equal(r.account.idle_taxes,0);
 // day 2: take at 130 -> 390 split 195/195 at the close.
 x+=195/120;y+=195/40;assert.ok(Math.abs(r.account.equity-(x*120+y*40)*scale)<1e-3);
 // X has a gain and is taxed only through its own rate (0); a 10% rate on X taxes the X sale gain of 20 per unit.
 const t=runSimulation(d,{...settings,initial:400*scale,budget:300*scale,idle:{kind:'index',series:['X','Y'],gainTax:[10,0]}});
 assert.ok(t.account.idle_taxes>0&&t.account.equity<r.account.equity);
});
test('idle legs report the ETF as a position: bought, sold, realized + unrealized = account gain beyond the stocks',()=>{
 const a=candidate('A',90,[price(),price(),price(100,135,95,130),price(),price()]);
 const d=input([a]);d.stocks[0].prices=d.stocks[0].prices.map(p=>({...p,open:p.open*scale,high:p.high*scale,low:p.low*scale,close:p.close*scale}));
 const bar=(o,c)=>({open:o,high:Math.max(o,c),low:Math.min(o,c),close:c});
 d.indices.X=[bar(100,100),bar(110,110),bar(120,120),bar(125,130),bar(130,130)];d.indices.Y=[bar(50,50),bar(40,40),bar(45,45),bar(50,50),bar(55,55)];
 const r=runSimulation(d,{...settings,initial:400*scale,budget:300*scale,costs:{buy:.015,sell:.215},idle:{kind:'index',series:['X','Y'],fee:.015,gainTax:[0,15.4]}});
 const legs=r.idle_legs,idle=legs.reduce((a,l)=>a+l.pnl,0);
 assert.equal(legs.length,2);assert.equal(legs[0].first_date,sessions[0]);assert.equal(legs[0].sells,1);
 for(const l of legs)assert.ok(Math.abs(l.sold+l.value-l.bought-l.pnl)<1e-6);
 assert.ok(Math.abs(r.account.pnl-r.summary.pnl-idle)<1e-3);
 assert.ok(Math.abs(legs.reduce((a,l)=>a+l.fees+l.taxes,0)-r.account.idle_fees-r.account.idle_taxes)<1e-6);
 assert.equal(r.benchmark_start,sessions[1]);
});
