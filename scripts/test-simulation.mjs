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
if(process.env.SIMULATION_PARITY==='1')test('real private data matches Python reference across settings',()=>{
 const data=JSON.parse(fs.readFileSync('public/data/live/simulation-input.json','utf8')),fixtures=JSON.parse(fs.readFileSync('work/simulation-parity.json','utf8'));
 const close=(a,b,label)=>assert.ok(a==null&&b==null||typeof a==='number'&&typeof b==='number'&&Math.abs(a-b)<1e-5,`${label}: ${a} != ${b}`);
 for(const f of fixtures){const r=runSimulation(data,f.settings);assert.equal(r.trades.length,f.trades.length);for(const t of r.trades){const p=f.trades.find(p=>p.code===t.code);assert.ok(p);for(const k of ['status','signal_date','entry_date','exit_date','shares','trading_days','calendar_days'])assert.equal(t[k],p[k],`${t.code} ${k}`);for(const k of ['invested','pnl','return_pct','entry_price','exit_price'])close(t[k],p[k],`${t.code} ${k}`);for(const h of [5,10,20]){assert.equal(t.horizons[h].status,p.horizons[h].status);close(t.horizons[h].stock,p.horizons[h].stock_return,'horizon');}}
 if(f.account)for(const k of ['cash','equity','pnl','return_pct'])close(r.account[k],f.account[k],k);close(r.summary.invested,f.summary.invested,'invested');close(r.benchmark.pnl,f.benchmark.index_pnl,'benchmark');}
});
