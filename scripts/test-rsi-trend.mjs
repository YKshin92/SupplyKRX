import test from 'node:test';
import assert from 'node:assert/strict';
import {pivots,rsiTrendlines} from '../src/rsi-trend.ts';
const s=v=>v.map((rsi,i)=>({date:`d${String(i).padStart(2,'0')}`,rsi}));
test('rising lows make an up line, falling highs a down line, extended until broken',()=>{
 const up=s([50,45,40,35,40,45,50,55,50,45,42,47,52,57,60,62,64,66]);
 const p=pivots(up);assert.deepEqual(p.lows,[3,10]);
 const lines=rsiTrendlines(up).filter(l=>l.kind==='up');
 assert.equal(lines.length,1);assert.deepEqual(lines[0].from,{date:'d03',y:35});assert.equal(lines[0].to.date,'d17');assert.equal(lines[0].broken,null);
 const down=s([50,55,60,65,60,55,50,45,50,55,58,53,48,43,40,38,45,52]);
 const d=rsiTrendlines(down).filter(l=>l.kind==='down');
 assert.equal(d.length,1);assert.deepEqual(d[0].from,{date:'d03',y:65});assert.equal(d[0].broken,'d17');
 assert.equal(rsiTrendlines(s([50,null,40,35,40,null,50])).length,0);
});
