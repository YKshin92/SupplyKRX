import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {corporateStep,initialCorporatePosition} from '../src/corporate-lifecycle.ts';
import {corporateActionMap} from '../src/corporate-context.ts';
import {splitDay} from '../src/split-lifecycle.ts';
import {runSimulation} from '../src/simulation-engine.ts';
const python=script=>{const proc=spawnSync('python',[fileURLToPath(new URL(script,import.meta.url))],{encoding:'utf8',maxBuffer:1<<26});assert.equal(proc.status,0,proc.stderr||proc.error?.message);return JSON.parse(proc.stdout);};
const quote=v=>v==null?null:{open:v[0],high:v[1],low:v[2],close:v[3],volume:v[4],change_pct:null};
const close=(a,b,path)=>{
 if(typeof a==='number'&&typeof b==='number'){assert.ok(Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a)),`${path}: ${a} != ${b}`);return;}
 if(a&&b&&typeof a==='object'){assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort(),path);for(const k of Object.keys(a))close(a[k],b[k],`${path}.${k}`);return;}
 assert.deepEqual(a,b,path);
};

test('bonus and spinoff lifecycle match Python at every field of every step',()=>{
 const fixture=JSON.parse(readFileSync(new URL('../tests/fixtures/corporate-lifecycle.json',import.meta.url),'utf8'));
 const expected=python('./corporate-lifecycle-fixture.py');
 fixture.scenarios.forEach((s,n)=>{
  let p=initialCorporatePosition(s.trade,s.trade.previous_close);const steps=[];
  for(const step of s.steps){const r=corporateStep(p,s.action,step.day,quote(step.quote),quote(step.asset),s.take??30,s.stop??10);p=r.position;steps.push(r);if(p.phase==='closed')break;}
  assert.equal(steps.length,expected[n].length,s.name);
  steps.forEach((r,i)=>close(r,expected[n][i],`${s.name}[${i}]`));
 });
});

test('bonus keeps locked shares until listing and never credits fractional cash',()=>{
 const s=JSON.parse(readFileSync(new URL('../tests/fixtures/corporate-lifecycle.json',import.meta.url),'utf8')).scenarios[0];
 let p=initialCorporatePosition(s.trade,s.trade.previous_close),cash=0;const out=[];
 for(const step of s.steps){const r=corporateStep(p,s.action,step.day,quote(step.quote),null);p=r.position;cash+=r.cash_in;out.push(r);}
 assert.equal(out[2].shares,141);assert.deepEqual(p.fractional_forfeit,[{asset:'무상배정 신주',fraction:'3/5'}]);
 assert.equal(out[3].cash_in,118*880);assert.equal(out[3].status,'open');assert.equal(out[3].held_value,23*880);
 assert.equal(out[5].status,'stop');assert.equal(out[5].cash_in,23*860);assert.equal(cash,118*880+23*860);assert.equal(out[5].pnl,cash-141600);
 assert.throws(()=>corporateStep(out[3].position,s.action,'004',quote([1,1,1,1,1]),null),/Out of order/);
});

test('split zero fraction policy floors shares, records the forfeit and keeps whole-share basis',()=>{
 const action={id:'split',known_on:'001',halt_start:'002',resume_date:'004',numerator:5,denominator:2};
 const p={entry_date:'001',entry_price:100,invested:5500,shares:55,basis_price:100,phase:'active',last_close:100,applied_actions:[]};
 const price={open:40,high:40,low:40,close:40,volume:100,change_pct:null};
 const strict=splitDay(splitDay(p,action,'002',null),action,'004',price);assert.equal(strict.phase,'unresolved');
 const zero={...action,fraction_policy:'zero'},r=splitDay(splitDay(p,zero,'002',null),zero,'004',price);
 assert.equal(r.phase,'active');assert.equal(r.shares,137);assert.equal(r.basis_price,5500/137);assert.equal(r.cash_delta,0);
 assert.deepEqual(r.fractional_forfeit,[{asset:'분할 후 주식',fraction:'1/2'}]);assert.equal(r.fractional_claim,undefined);
 const tiny=splitDay(splitDay({...p,shares:1,invested:100},{...zero,numerator:1,denominator:2},'002',null),{...zero,numerator:1,denominator:2},'004',price);
 assert.equal(tiny.phase,'unresolved');
});

test('integrated bonus and spinoff account matches Python, restores NAV and reuses proceeds next session',()=>{
 const f=python('./corporate-account-fixture.py'),r=runSimulation(f.data,f.settings,f.corporate);
 for(const p of f.expected.trades){const t=r.trades.find(t=>t.code===p.code);for(const [k,v] of Object.entries(p))close(t[k]??null,v,`${p.code}.${k}`);}
 f.expected.ledger.forEach((e,i)=>{for(const [k,v] of Object.entries(e))close(r.ledger[i][k],v,`ledger ${i}.${k}`);});
 assert.notEqual(r.account.equity,null);assert.equal(r.account.unknown_cost,0);
 const baseline=runSimulation(f.data,f.settings);assert.equal(baseline.account.equity,null);
 const noAsset=structuredClone(f.data);delete noAsset.corporate_assets;
 assert.equal(runSimulation(noAsset,f.settings,f.corporate).trades.find(t=>t.code==='000002').status,'unresolved');
});

test('context contract accepts audited bonus/spinoff shapes and rejects malformed ones',()=>{
 const base={as_of:'2026-10-29',policy:'test',actions:[
  {code:'323990',id:'b',kind:'bonus',known_on:'2023-10-30',ex_date:'2023-11-10',listing_date:'2023-11-30',numerator:1,denominator:5,fraction_policy:'zero',evidence_on:'2023-11-27',source:'https://example.test/b'},
  {code:'000070',id:'s',kind:'spinoff',known_on:'2025-05-30',halt_start:'2025-10-30',resume_date:'2025-11-24',numerator:9039233,denominator:10000000,new_code:'0120G0',new_name:'신설',new_numerator:960767,new_denominator:1000000,fraction_policy:'zero',evidence_on:'2026-03-23',source:'https://example.test/s'}]};
 assert.equal(corporateActionMap(base).size,2);
 for(const [i,patch] of [[0,{listing_date:'2023-11-10'}],[0,{ex_date:undefined}],[0,{fraction_policy:'cash'}],[0,{kind:'merger'}],[1,{new_code:'000070'}],[1,{new_code:'../x'}],[1,{new_numerator:0}],[1,{new_name:' '}],[1,{evidence_on:'2026-10-30'}]]){
  const c=structuredClone(base);Object.assign(c.actions[i],patch);assert.throws(()=>corporateActionMap(c),/context/,JSON.stringify(patch));
 }
 const policy=structuredClone(base);policy.policy=1;assert.throws(()=>corporateActionMap(policy),/context/);
});
