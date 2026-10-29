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
test('zero-valued fractions, locked bonus shares and joint spinoff rules are disclosed',()=>{
 const bonus=corporateNotes({entry_price:25400,adjusted_basis:21257,corporate_phase:'closed',reason:'손절선 아래 갭 시가 청산 · 무상신주 23주 2023-11-30 상장일 시가 매도',fractional_forfeit:[{asset:'무상배정 신주',fraction:'3/5'}],corporate_evidence_on:'2023-11-27'}).join(' ');
 assert.match(bonus,/무상배정 신주 0\.6주/);assert.match(bonus,/0원 처리/);assert.match(bonus,/상장일 시가/);
 const spin=corporateNotes({entry_price:87900,adjusted_basis:47000,corporate_legs:[{name:'존속 주식',code:'',shares:30,price:1},{name:'삼양바이오팜',code:'0120G0',shares:32,price:1}],fractional_forfeit:[{asset:'존속 주식',fraction:'3666961/5000000'}]}).join(' ');
 assert.match(spin,/합계/);assert.match(spin,/다음 거래일 시가/);assert.match(spin,/존속 주식 0\.7333922주/);
});
