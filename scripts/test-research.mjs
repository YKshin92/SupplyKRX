import test from 'node:test';
import assert from 'node:assert/strict';
import {netResearchReturn,researchStats} from '../src/research-metrics.ts';
test('research excludes short followup and suspicious prices instead of inserting zero',()=>{
 const event=(id,o)=>({id,signal_date:'2026-08-01',outcomes:{5:{split:'test',reason:null,gross:10,benchmark:2,anomaly:false,...o}}});
 const rows=[event('ok',{}),event('short',{gross:null,reason:'insufficient_followup'}),event('split',{anomaly:true})];
 const r=researchStats(rows,'5','all',.4,false);
 assert.equal(r.n,1);assert.equal(r.excluded.insufficient_followup,1);assert.equal(r.excluded.price_anomaly,1);
 assert.equal(r.mean,netResearchReturn(10,.4));assert.equal(researchStats(rows,'5','train',0,true).n,0);
});
