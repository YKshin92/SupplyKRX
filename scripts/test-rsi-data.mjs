import test from 'node:test';
import assert from 'node:assert/strict';
import {validRsi,readRsi,stateLabel,reasonLabel} from '../src/rsi-data.ts';
const ok={schema_version:1,as_of:'2026-10-29',rules:{},population:2,computed:1,below30:1,entries_today:1,missing:{},indices:{},stocks:[{code:'005930',rsi:29.8},{code:'0035S0',rsi:null}]};
test('RSI snapshot validation rejects malformed codes, dates and out-of-range values',()=>{
 assert.ok(validRsi(ok));
 for(const bad of [{...ok,schema_version:2},{...ok,as_of:'2026/10/29'},{...ok,stocks:[{code:'../x',rsi:1}]},{...ok,stocks:[{code:'005930',rsi:101}]},null])assert.equal(validRsi(bad),false);
});
test('loader validates once and labels states/reasons in Korean',async()=>{
 assert.equal((await readRsi(async()=>ok)).as_of,'2026-10-29');
 assert.equal(stateLabel('below30'),'30 미만');assert.equal(stateLabel(null),'산출 불가');assert.match(reasonLabel('warmup'),/관측 부족/);
});
