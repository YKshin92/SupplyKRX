import test from 'node:test';
import assert from 'node:assert/strict';
import {readTracking} from '../src/tracking-data.ts';
test('both historical and live fallback tracking support bounded shards',async()=>{
 for(const root of ['tracking-history','tracking-events']){
  const reader=async path=>path.endsWith(`${root}.json`)?{schema_version:1,as_of:'2026-10-23',events:[],files:[`${root}-000.json`,`${root}-001.json`]}:[{id:path}];
  const d=await readTracking(root,'2026-10-23',reader);assert.equal(d.events.length,2);assert.equal(root==='tracking-history'?d.history_available:d.history_pending,true);
 }
});
test('legacy inline data works and stale, duplicate or escaping parts are rejected before fetching',async()=>{
 const m={schema_version:1,as_of:'2026-10-23',events:[{id:'legacy'}]};
 assert.equal((await readTracking('tracking-events',m.as_of,async()=>m)).events[0].id,'legacy');
 await assert.rejects(readTracking('tracking-history','2026-10-24',async()=>m));
 for(const files of [['../auth.json'],['tracking-history-000.json','tracking-history-000.json']])await assert.rejects(readTracking('tracking-history',m.as_of,async()=>({...m,files})));
});
