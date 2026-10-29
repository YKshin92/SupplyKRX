import test from 'node:test';
import assert from 'node:assert/strict';
import {RELEASES,isRecent,recentTabs,recentSelectors,latestRelease} from '../src/release-notes.ts';
test('release history is ordered, unique and points at real screens',()=>{
 assert.equal(latestRelease,RELEASES[0]);
 assert.equal(new Set(RELEASES.map(r=>r.id)).size,RELEASES.length);
 for(let i=1;i<RELEASES.length;i++)assert.ok(RELEASES[i-1].date>=RELEASES[i].date,'newest first');
 for(const r of RELEASES){assert.match(r.date,/^\d{4}-\d{2}-\d{2}$/);assert.ok(r.changes.length&&r.targets.length&&r.verified);for(const t of r.targets)assert.ok(['market','explore','cases','simulation'].includes(t.tab));}
});
test('NEW lasts seven calendar days and ignores superseded releases',()=>{
 assert.equal(isRecent('2026-10-29','2026-10-29'),true);assert.equal(isRecent('2026-10-29','2026-11-04'),true);
 assert.equal(isRecent('2026-10-29','2026-11-05'),false);assert.equal(isRecent('2026-10-29','2026-10-28'),false);
 assert.ok(recentTabs('2026-10-30').has('simulation'));assert.equal(recentTabs('2026-12-01').size,0);
 assert.ok(recentSelectors('2026-10-30').has('.corporate-reconciliation'));
 const superseded=RELEASES.find(r=>r.superseded);assert.ok(superseded);
});
