import test from 'node:test';
import assert from 'node:assert/strict';
import {priceComparison} from '../src/price-comparison.ts';
const p=n=>({open:n,high:n,low:n,close:n,volume:100,change_pct:0});
test('raw-price comparisons stop across a split and start fresh for later signals',()=>{
 assert.equal(priceComparison([p(100),p(20),p(20)],['001','002','003'],'001').status,'blocked');
 assert.equal(priceComparison([p(100),p(20),p(20)],['001','002','003'],'003').status,'comparable');
});
test('halt, missing row and absent anchor never turn into a normal percentage',()=>{
 assert.equal(priceComparison([p(100),{...p(100),volume:0}],['001','002'],'001').status,'blocked');
 assert.equal(priceComparison([p(100),null],['001','002'],'001').date,'002');
 assert.equal(priceComparison([p(100)],['001'],'absent').status,'blocked');
 assert.equal(priceComparison([p(100),p(100)],['001','002'],'001').status,'comparable');
});
