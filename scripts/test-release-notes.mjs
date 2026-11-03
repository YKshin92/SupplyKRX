import test from 'node:test';
import assert from 'node:assert/strict';
import {RELEASES,isRecent,recentTabs,recentSelectors,latestRelease,unseenTabs,readSeenReleases,markSeen,releaseIdsFor,SEEN_RELEASES_KEY} from '../src/release-notes.ts';
test('release history is ordered, unique and points at real screens',()=>{
 assert.equal(latestRelease,RELEASES[0]);
 assert.equal(new Set(RELEASES.map(r=>r.id)).size,RELEASES.length);
 for(let i=1;i<RELEASES.length;i++)assert.ok(RELEASES[i-1].date>=RELEASES[i].date,'newest first');
 for(const r of RELEASES){assert.match(r.date,/^\d{4}-\d{2}-\d{2}$/);assert.ok(r.changes.length&&r.targets.length&&r.verified);for(const t of r.targets)assert.ok(['market','explore','cases','simulation','signals','candidates'].includes(t.tab));}
});
test('NEW lasts seven calendar days and ignores superseded releases',()=>{
 assert.equal(isRecent('2026-10-29','2026-10-29'),true);assert.equal(isRecent('2026-10-29','2026-11-04'),true);
 assert.equal(isRecent('2026-10-29','2026-11-05'),false);assert.equal(isRecent('2026-10-29','2026-10-28'),false);
 assert.ok(recentTabs('2026-10-30').has('simulation'));assert.equal(recentTabs('2026-12-01').size,0);
 assert.ok(recentSelectors('2026-10-30').has('.corporate-reconciliation'));
 const superseded=RELEASES.find(r=>r.superseded);assert.ok(superseded);
});

test('tab NEW only for releases this browser has not seen; first visit sees everything; opening a tab clears it',()=>{
 const store=new Map();const storage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v)};
 const first=readSeenReleases(storage);assert.equal(unseenTabs(first).size,0,'first visit: nothing is NEW');assert.ok(store.has(SEEN_RELEASES_KEY));
 const latest=RELEASES.find(r=>!r.superseded);const without=new Set([...first].filter(id=>id!==latest.id));
 const tabs=unseenTabs(without);assert.deepEqual([...tabs].sort(),[...new Set(latest.targets.map(t=>t.tab))].sort(),'only the tabs of the unseen release');
 const tab=latest.targets[0].tab;const after=markSeen(without,tab,storage);assert.ok(!unseenTabs(after).has(tab));
 assert.deepEqual(new Set(JSON.parse(store.get(SEEN_RELEASES_KEY))),after);
 assert.ok(releaseIdsFor(tab).includes(latest.id));
 store.set(SEEN_RELEASES_KEY,'not json');assert.equal(unseenTabs(readSeenReleases(storage)).size,0,'broken storage never lights every tab');
});
