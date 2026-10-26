import test from 'node:test';
import assert from 'node:assert/strict';
import {splitDay} from '../src/split-lifecycle.ts';
import {splitValue} from '../src/split-valuation.ts';
import {runSimulation} from '../src/simulation-engine.ts';
import {corporateActionMap} from '../src/corporate-context.ts';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const position=()=>({entry_date:'001',entry_price:100,invested:1000,shares:10,basis_price:100,phase:'active',last_close:110,applied_actions:[]});
const action={id:'split',known_on:'001',halt_start:'002',resume_date:'004',numerator:5,denominator:1};
const price=n=>({open:n,high:n,low:n,close:n,volume:100,change_pct:null});

test('shared context contract rejects impossible dates, future evidence, credentials and invalid ratios',()=>{
 const fixture=JSON.parse(readFileSync(new URL('../tests/fixtures/corporate-context.json',import.meta.url),'utf8'));
 assert.equal(corporateActionMap(fixture.valid).size,1);
 for(const patch of fixture.invalid){const value=structuredClone(fixture.valid);if(patch.action)Object.assign(value.actions[0],patch.action);else Object.assign(value,patch);assert.throws(()=>corporateActionMap(value),/context/,JSON.stringify(patch));}
 const duplicate=structuredClone(fixture.valid);duplicate.actions.push({...duplicate.actions[0],code:'000002'});assert.throws(()=>corporateActionMap(duplicate),/context/);
 const alpha=structuredClone(fixture.valid);alpha.actions[0].code='00AB12';assert.ok(corporateActionMap(alpha).has('00AB12'));
});

test('integrated split account matches Python, keeps halt NAV unknown and reuses sales next session',()=>{
 const proc=spawnSync('python',[fileURLToPath(new URL('./corporate-portfolio-fixture.py',import.meta.url))],{encoding:'utf8'});
 assert.equal(proc.status,0,proc.stderr||proc.error?.message);
 const f=JSON.parse(proc.stdout),r=runSimulation(f.data,f.settings,f.corporate);
 for(const t of r.trades){const p=f.expected.trades.find(p=>p.code===t.code);for(const [k,v] of Object.entries(p))assert.deepEqual(t[k],v,`${t.code} ${k}`);}
 for(let i=0;i<r.ledger.length;i++)for(const [k,v] of Object.entries(f.expected.ledger[i]))assert.deepEqual(r.ledger[i][k],v,`${i} ${k}`);
 const baseline=runSimulation(f.data,f.settings);assert.equal(baseline.trades[0].status,'unresolved');assert.equal(baseline.account.equity,null);
 const invalid=structuredClone(f.corporate);invalid.actions.push({...invalid.actions[0]});assert.throws(()=>runSimulation(f.data,f.settings,invalid),/context/);
 const future=structuredClone(f.corporate);future.actions[0].evidence_on='2027-01-01';assert.throws(()=>runSimulation(f.data,f.settings,future),/context/);
 const fractional=structuredClone(f.corporate);fractional.actions[0].denominator=2;
 const unresolved=runSimulation(f.data,f.settings,fractional);assert.equal(unresolved.account.cash,0);assert.equal(unresolved.account.equity,null);assert.equal(unresolved.trades[0].status,'unresolved');assert.equal(unresolved.trades[1].entry_date,null);
});

test('shared lifecycle fixtures match Python at every field of every step',()=>{
 const fixture=JSON.parse(readFileSync(new URL('../tests/fixtures/split-lifecycle.json',import.meta.url),'utf8'));
 const results=fixture.cases.map(c=>{
  let p={...fixture.position,...c.position};const a={...fixture.action,...c.action};
  return c.steps.map(step=>{
   p=splitDay(p,a,step.day,step.price==null?step.quote:price(step.price));
   for(const [key,value] of Object.entries(step.expect))assert.deepEqual(p[key],value,`${c.name}: ${step.day} ${key}`);
   return p;
  });
 });
 const python=spawnSync('python',[fileURLToPath(new URL('./split-lifecycle-fixture.py',import.meta.url))],{encoding:'utf8'});
 assert.equal(python.status,0,python.stderr||python.error?.message);
 const valuations=fixture.valuations.map(c=>{
  const value=splitValue({...fixture.position,...c.position},c.quote);
  for(const [key,expected] of Object.entries(c.expect))assert.deepEqual(value[key],expected,`${c.name}: ${key}`);
  return value;
 });
 assert.deepEqual({transitions:results,valuations},JSON.parse(python.stdout));
});

test('invalid shares and unsafe ratio arithmetic are rejected',()=>{
 for(const shares of [0,-1,true,1.5,9007199254740992])assert.throws(()=>splitDay({...position(),shares},action,'002',null),/Invalid position shares/);
 const halt=splitDay(position(),action,'002',null);
 for(const numerator of [true,0,-1,1.5,9007199254740991])assert.throws(()=>splitDay(halt,{...action,numerator},'004',price(22)),/Invalid split ratio/);
});

test('valuation never turns halted, missing or invalid prices into cash',()=>{
 const p={...position(),shares:50,basis_price:20,last_close:22};
 for(const phase of ['halted','unresolved']){
  const v=splitValue({...p,phase},price(22));assert.equal(v.pnl,null);assert.equal(v.confirmed_value,null);assert.equal(v.sale_proceeds,0);
 }
 assert.equal(splitValue(p,null).status,'unresolved');assert.equal(splitValue(p,{...price(22),volume:0}).status,'unresolved');
 for(const [take,stop] of [[NaN,10],[30,Infinity],[0,10],[30,51]])assert.throws(()=>splitValue(p,price(22),take,stop),/Invalid barriers/);
 for(const patch of [{shares:0},{shares:1.5},{invested:-1}])assert.throws(()=>splitValue({...p,...patch},price(22)),/Invalid position cost/);
});
test('verified halt resumes once with adjusted basis and unchanged original cost',()=>{
 const original=position(),halt=splitDay(original,action,'002',null);assert.equal(original.phase,'active');assert.equal(halt.phase,'halted');
 const resumed=splitDay(halt,action,'004',price(22));assert.equal(resumed.shares,50);assert.equal(resumed.entry_price,100);assert.equal(resumed.basis_price,20);assert.equal(resumed.invested,1000);assert.deepEqual(splitDay(resumed,action,'004',price(22)),resumed);
});
test('unknown gaps, failed resumption and fractional rights never become fabricated cash',()=>{
 const p=position(),gap=splitDay(p,action,'001',null);assert.equal(splitDay(gap,action,'004',price(22)).phase,'unresolved');
 const failed=splitDay(splitDay(p,action,'002',null),action,'004',null);assert.equal(splitDay(failed,action,'005',price(22)).phase,'unresolved');
 const fraction=splitDay(splitDay({...p,shares:55},action,'002',null),{...action,denominator:2},'004',price(44));assert.equal(fraction.phase,'unresolved');assert.equal(fraction.shares,55);assert.equal(fraction.cash_delta,0);
 assert.equal(splitDay(p,{...action,known_on:'003'},'002',null).phase,'unresolved');
});
