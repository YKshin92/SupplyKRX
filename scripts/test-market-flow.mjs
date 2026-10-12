import {test} from 'node:test';
import assert from 'node:assert/strict';
import {aggregateFlow,periodFlowTotal} from '../src/market-flow.ts';

test('period total changes with the selected sessions and preserves missing coverage',()=>{
 const d={manifest:{sessions:['2026-10-05','2026-10-06','2026-10-07'],as_of:'2026-10-07',days:3},stocks:[{spark:[100,200,300]},{spark:[-50,null,0]}]};
 assert.deepEqual(periodFlowTotal(d),{net:550,partial:true,days:3});
 assert.deepEqual(periodFlowTotal({manifest:{...d.manifest,days:1},stocks:[{spark:[300]},{spark:[0]}]}),{net:300,partial:false,days:1});
 assert.equal(periodFlowTotal({...d,stocks:[{spark:[null,null,null]}]}).net,null);
 assert.equal(periodFlowTotal({...d,manifest:{...d.manifest,status:'calendar_unverified'}}).net,null);
});

test('three-month view retains all sixty positions and gaps',()=>{
 const dates=Array.from({length:60},(_,i)=>new Date(Date.UTC(2026,6,10+i)).toISOString().slice(0,10));
 const values=dates.map((_,i)=>i===40?null:i);
 const result=aggregateFlow({manifest:{sessions:dates,as_of:dates.at(-1),days:60},stocks:[{spark:values}]});
 assert.equal(result.length,60);assert.equal(result[0].date,dates[0]);assert.equal(result[40].net,null);assert.equal(result.at(-1).net,59);
});

test('aggregate preserves zero, signed sums and coverage without inventing missing values',()=>{
 const d={manifest:{sessions:['2026-10-05','2026-10-06','2026-10-07','2026-10-08'],as_of:'2026-10-07'},stocks:[{spark:[100,0,null]},{spark:[-30,null,null]}]};
 assert.deepEqual(aggregateFlow(d),[
  {date:'2026-10-05',net:70,known:2,total:2},
  {date:'2026-10-06',net:0,known:1,total:2},
  {date:'2026-10-07',net:null,known:0,total:2},
 ]);
});
test('summary positions use the last twenty sessions of their own dataset',()=>{
 const dates=Array.from({length:25},(_,i)=>`2026-09-${String(i+1).padStart(2,'0')}`);
 const result=aggregateFlow({manifest:{sessions:dates,as_of:dates.at(-1)},stocks:[{spark:Array.from({length:20},(_,i)=>i)}]});
 assert.equal(result.length,20);assert.equal(result[0].date,dates[5]);assert.equal(result.at(-1).net,19);
});
