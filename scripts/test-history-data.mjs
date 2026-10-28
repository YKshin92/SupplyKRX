import test from 'node:test';
import assert from 'node:assert/strict';
import {historyDetail} from '../src/history-data.ts';
const manifest={sessions:['2026-08-01'],as_of:'2026-10-23',generation:'generations/1234567890abcdef'};
test('current historical details fall back to protected live data while refresh is pending',async()=>{
 const paths=[];const read=async path=>{paths.push(path);if(path.includes('history-stock-'))throw Error('not ready');return path.endsWith('manifest.json')?manifest:[];};
 const d=await historyDetail('000001','2026-10-01',read);assert.equal(d.pending,true);assert.ok(paths.every(p=>p.startsWith('/data/live/')));
});
test('old events never masquerade as recent-only details',async()=>{
 await assert.rejects(historyDetail('000001','2024-10-01',async path=>{if(path.includes('history-stock-'))throw Error();return manifest;}));
});
test('generation paths cannot escape protected data and invalid codes are refused',async()=>{
 await assert.rejects(historyDetail('../key','2026-10-01',async()=>{throw Error('must not be called');}));
 await assert.rejects(historyDetail('000001','2026-10-01',async path=>{if(path.includes('history-stock-'))throw Error();return {...manifest,generation:'../../api/auth'};}));
});

test('a historical foreign series cannot contain institution/private-fund rows or duplicate days',async()=>{
 const row={code:'000001',date:'2026-10-23',investor:'외국인',net:0};
 const data={as_of:'2026-10-23',pension:[],foreign:[row]};
 assert.equal((await historyDetail('000001','2026-10-01',async()=>data)).foreign[0].net,0);
 for(const foreign of [[{...row,investor:'사모'}],[{...row,investor:'기관합계'}],[row,row],[{...row,date:'2026-10-24'}]])await assert.rejects(historyDetail('000001','2026-10-01',async()=>({...data,foreign})),/mismatch/);
});
