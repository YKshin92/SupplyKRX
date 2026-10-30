import test from 'node:test';
import assert from 'node:assert/strict';
import {chaseWarning} from '../src/chase.ts';
const day=i=>`2026-10-${String(i+1).padStart(2,'0')}`;
test('flags only a big up day on a 5x volume spike in the latest session',()=>{
 const rows=Array.from({length:21},(_,i)=>({date:day(i),close:100,volume:1000,change_pct:0}));
 assert.equal(chaseWarning(rows),null);
 rows[20]={date:day(20),close:110,volume:6000,change_pct:10};
 const w=chaseWarning(rows);assert.equal(w.date,day(20));assert.ok(Math.abs(w.ratio-6)<1e-9);
 rows[20]={date:day(20),close:110,volume:4000,change_pct:10};assert.equal(chaseWarning(rows),null);
 rows[20]={date:day(20),close:104,volume:9000,change_pct:4};assert.equal(chaseWarning(rows),null);
 assert.equal(chaseWarning(rows.slice(10)),null);
});
