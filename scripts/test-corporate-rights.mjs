import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {corporateRights} from '../src/corporate-rights.ts';
const holding=(code,day)=>({code,status:'unresolved',reason:`${day} 가격 미확인`,entry_date:'2023-10-23',shares:7});
test('rights match the Python rational planner for all three event types without cash or mutation',()=>{
 const proc=spawnSync('python',['-c',"import json;from collector.corporate_position import ACTIONS,entitlement_plan;print(json.dumps({a['code']:entitlement_plan(a,7) for a in ACTIONS}))"],{encoding:'utf8'});
 assert.equal(proc.status,0,proc.stderr);const expected=JSON.parse(proc.stdout);
 for(const [code,day] of [['025900','2024-04-12'],['323990','2023-11-10'],['000070','2025-10-30']]){
  const t=holding(code,day),before=JSON.stringify(t),r=corporateRights(t,'2026-10-29');
  assert.equal(JSON.stringify(t),before);assert.equal(r.cashCredited,0);assert.equal(r.settled,false);
  assert.deepEqual(r.legs.map(l=>[l.whole,l.fraction??'0']),expected[code].legs.map(l=>[l.whole_shares,l.fractional_shares]));
 }
});
test('bonus rights stay separately locked until the actual additional listing date',()=>{
 const t=holding('323990','2023-11-10');
 assert.equal(corporateRights(t,'2023-11-29').legs[1].listed,false);
 assert.equal(corporateRights(t,'2023-11-30').legs[1].listed,true);
 assert.match(corporateRights(t,'2023-11-30').cashRule,/지급일 미확인/);
});
test('later entries, unrelated failures, settled/adjusted and unsafe quantities are not assigned old rights',()=>{
 const t=holding('025900','2024-04-12');
 for(const patch of [{entry_date:'2024-04-12'},{reason:'2025-01-01 가격 미수집'},{status:'take'},{corporate_phase:'unresolved'},{shares:0},{shares:1.5},{shares:Number.MAX_SAFE_INTEGER}])assert.equal(corporateRights({...t,...patch},'2026-10-29'),null);
 assert.equal(corporateRights(t,'2024-04-11'),null);
});
test('whole-share entitlements do not invent a fractional-payment dependency',()=>{
 for(const [code,day] of [['025900','2024-04-12'],['323990','2023-11-10']]){
  const r=corporateRights({...holding(code,day),shares:10},'2026-10-29');
  assert.ok(r.legs.every(l=>l.fraction===null));assert.equal(r.cashRule,null);
  assert.ok(r.blockers.every(x=>!x.includes('단주')));assert.equal(r.settled,false);
 }
});
