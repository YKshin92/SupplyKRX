import test from 'node:test';
import assert from 'node:assert/strict';
import {adjustedBasis,corporateNotes} from '../src/simulation-presentation.ts';
test('original entry and adjusted basis remain separate; raw-price unit warning is explicit',()=>{
 const t={entry_price:81200,adjusted_basis:16240,shares:180,corporate_evidence_on:'2026-05-15'};
 assert.equal(adjustedBasis(t),16240);assert.equal(t.entry_price,81200);
 assert.ok(corporateNotes(t).some(s=>s.includes('원주가')));
 assert.ok(corporateNotes(t).some(s=>s.includes('신호일 매수 점수에 사용하지 않음')));
 assert.equal(adjustedBasis({...t,adjusted_basis:81200}),null);
 assert.deepEqual(corporateNotes({entry_price:100,adjusted_basis:100}),[]);
});
test('halt reference and unpaid fractions cannot be described as confirmed cash',()=>{
 const notes=corporateNotes({entry_price:100,corporate_phase:'halted',fractional_claim:{numerator:1,denominator:2}}).join(' ');
 assert.match(notes,/확정 자산·손익에 포함하지 않습니다/);
 assert.match(notes,/단주 1\/2주/);assert.match(notes,/현금에 반영하지 않았습니다/);
});
