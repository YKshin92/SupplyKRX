import test from 'node:test';
import assert from 'node:assert/strict';
import {trackedEntries,passesRecentNet} from '../src/tracked-entries.ts';
test('registered stocks retain their first signal through sales and repeated signals',()=>{
 const original={code:'000001',signal_date:'2026-08-10',status:'closed',current_return:12};
 const later={code:'000001',signal_date:'2026-09-20',status:'open',current_return:2};
 const other={code:'000002',signal_date:'2026-09-01',status:'open',current_return:null};
 assert.deepEqual(trackedEntries([later,other,original]),[original,other]);
 assert.equal(trackedEntries([original])[0].current_return,12);
});
test('recent net presets use inclusive thresholds and preserve missing in all view',()=>{
 assert.equal(passesRecentNet(5e8,5),true);
 assert.equal(passesRecentNet(5e8-1,5),false);
 assert.equal(passesRecentNet(3e8,3),true);
 assert.equal(passesRecentNet(1e8,1),true);
 assert.equal(passesRecentNet(null,1),false);
 assert.equal(passesRecentNet(null,0),true);
 assert.equal(passesRecentNet(-1,0),true);
});
