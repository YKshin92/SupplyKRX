import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rankPaths,compareRanks,loadRanks} from '../src/flow-rank-data.ts';

const manifest={version:'flow-rank-equal8-v1',state:'ready',generation:'generations/0123456789abcdef0123',files:['ranks-000.json'],population:2};
test('immutable rank paths reject traversal and duplicate parts; unavailable keeps its reason',()=>{
 assert.equal(rankPaths(manifest)[0],'/data/live/flow-ranks/generations/0123456789abcdef0123/ranks-000.json');
 for(const patch of [{generation:'../private'},{files:['../secret.json']},{files:['ranks-000.json','ranks-000.json']},{version:'future'}])assert.throws(()=>rankPaths({...manifest,...patch}));
 assert.deepEqual(rankPaths({state:'unavailable',reason:'기준일 시총 자료 미수집'}),[]);
});
test('missing scores and relative values always last, filters never recalculate ranks',()=>{
 const stocks=[{code:'001',score:10,components:{'외국인:relative':{value:.01,rank:100,population:2602}}},{code:'002',score:null,components:{}},{code:'003',score:30,components:{'외국인:relative':{value:.05,rank:3,population:2602}}}];
 assert.deepEqual([...stocks].sort((a,b)=>compareRanks(a,b,'score')).map(s=>s.code),['003','001','002']);
 assert.deepEqual([...stocks].sort((a,b)=>compareRanks(a,b,'score',true)).map(s=>s.code),['001','003','002']);
 const filtered=stocks.filter(s=>s.code==='003').sort((a,b)=>compareRanks(a,b,'외국인:relative'));
 assert.equal(filtered[0].components['외국인:relative'].rank,3);assert.equal(filtered[0].components['외국인:relative'].population,2602);
});
test('rank loading coalesces requests and rejects incomplete population',async()=>{
 const previous=globalThis.fetch;let calls=0;
 globalThis.fetch=async url=>{calls++;return {ok:true,json:async()=>String(url).endsWith('latest.json')?manifest:[{code:'001'},{code:'002'}]};};
 try{const [a,b]=await Promise.all([loadRanks('latest','test-1'),loadRanks('latest','test-1')]);assert.equal(a,b);assert.equal(calls,2);
 await loadRanks('latest','test-1','rebuilt-after-institution-backfill');assert.equal(calls,4);
 globalThis.fetch=async url=>({ok:true,json:async()=>String(url).endsWith('latest.json')?manifest:[{code:'001'}]});
 await assert.rejects(loadRanks('latest','test-2'),/종목 수/);
 }finally{globalThis.fetch=previous;}
});
