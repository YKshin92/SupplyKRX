import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionData,parallelParts} from '../src/history-cache.ts';
test('tab revisits share one in-flight request and failed requests can retry',async()=>{
 let calls=0;const read=async()=>{calls++;return [1,2];};
 const [a,b]=await Promise.all([sessionData('test:tab',read),sessionData('test:tab',read)]);
 assert.equal(calls,1);assert.equal(a,b);
 await assert.rejects(sessionData('test:retry',async()=>{throw Error('network');}));
 assert.equal(await sessionData('test:retry',async()=>42),42);
});
test('historical parts load concurrently with a bounded request count and stable order',async()=>{
 let active=0,max=0;
 const result=await parallelParts([0,1,2,3,4,5],async n=>{
  active++;max=Math.max(active,max);await new Promise(r=>setTimeout(r,6-n));active--;return n;
 },3);
 assert.deepEqual(result,[0,1,2,3,4,5]);assert.equal(max,3);
});
