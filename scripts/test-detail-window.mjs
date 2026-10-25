import test from 'node:test';
import assert from 'node:assert/strict';
import {detailWindow} from '../src/detail-window.ts';
import {issueDiagnosis} from '../src/simulation-issues.ts';
const rows=Array.from({length:150},(_,i)=>({date:String(i).padStart(3,'0')}));
test('old events retain 20 prior and 40 following observations rather than latest bars',()=>{
 const w=detailWindow(rows,'030');assert.equal(w.before,20);assert.equal(w.after,40);assert.equal(w.rows[0].date,'010');assert.equal(w.rows.at(-1).date,'070');
});
test('late exit or issue includes ten following sessions without truncating the base window',()=>{
 assert.equal(detailWindow(rows,'030','090').rows.at(-1).date,'100');
 assert.equal(detailWindow(rows,'030',null,'110').rows.at(-1).date,'120');
 assert.equal(detailWindow(rows,'030','035').after,40);
});
test('listing and latest boundaries are reported honestly, missing signals yield no substitute',()=>{
 assert.equal(detailWindow(rows,'005').before,5);assert.equal(detailWindow(rows,'145').after,4);assert.equal(detailWindow(rows,'absent').signalFound,false);assert.equal(detailWindow(rows,'absent').rows.length,0);
});
test('specific verified actions and generic quote gaps remain distinct from unbought records',()=>{
 assert.equal(issueDiagnosis({code:'007340',status:'unresolved',reason:'2024-09-25 일봉 가격 미수집'}).kind,'corporate');
 assert.equal(issueDiagnosis({code:'025900',status:'unresolved',reason:'2024-04-12 일봉 가격 미수집'}).kind,'missing');
 assert.equal(issueDiagnosis({code:'323990',status:'unresolved',reason:'2023-11-10 가격 단절'}).kind,'price_basis');
 assert.equal(issueDiagnosis({code:'007340',status:'pending',reason:'현금 부족'}),null);
});
