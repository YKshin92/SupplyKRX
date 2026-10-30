import test from 'node:test';
import assert from 'node:assert/strict';
import {adjustRows} from '../src/price-adjust.ts';
test('reverse split scales earlier bars like collector/price_adjust.py',()=>{
 const rows=[{date:'2026-10-01',open:1035,high:1035,low:1035,close:1035,volume:0,change_pct:0},{date:'2026-10-02',open:10700,high:10900,low:10200,close:10300,volume:194461,change_pct:-0.48}];
 const {rows:out,points}=adjustRows(rows);
 assert.equal(points.length,1);assert.ok(Math.abs(points[0].factor-10)<0.01);
 assert.ok(Math.abs(out[0].close-10350)<5);assert.equal(out[1].close,10300);assert.equal(rows[0].close,1035);
 assert.equal(adjustRows([{date:'a',close:100,change_pct:null},{date:'b',close:300,change_pct:null}]).points.length,0);
});
