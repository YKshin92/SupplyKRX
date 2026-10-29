import test from 'node:test';
import assert from 'node:assert/strict';
import {FLOW_INVESTORS,investorRows,withInvestorFlow,compactVolume} from '../src/investor-flow.ts';
const row=(date,net,investor='기관합계',code='005930')=>({date,net,investor,code});
test('buttons are ordered 기관합계·연기금·사모펀드 with pension as the KRX "연기금 등" series',()=>{
 assert.deepEqual(FLOW_INVESTORS.map(f=>f.label),['기관합계','연기금','사모펀드']);
 assert.equal(FLOW_INVESTORS.find(f=>f.key==='pension').investor,'연기금 등');
});
test('investor series replaces flows by date, never zero-fills and breaks cumulative after a gap',()=>{
 const base=[{date:'d1',net:5,cumulative:5},{date:'d2',net:7,cumulative:12},{date:'d3',net:1,cumulative:13}];
 const out=withInvestorFlow(base,[row('d1',2),row('d3',4)]);
 assert.deepEqual(out.map(r=>r.net),[2,null,4]);assert.deepEqual(out.map(r=>r.cumulative),[2,null,null]);
 assert.equal(withInvestorFlow(base,null),null);assert.equal(base[0].net,5);
});
test('loader validates manifest investor, generation and code before use',async()=>{
 const files={'/data/live/periods/3m/institution/manifest.json':{investor:'기관합계',generation:'generations/0123456789abcdef'},
  '/data/live/periods/3m/institution/generations/0123456789abcdef/stocks/005930.json':[row('d1',1),row('d2',2,'연기금 등'),row('d3',3,'기관합계','000660')],
  '/data/live/periods/3m/private-fund/manifest.json':{investor:'기관합계',generation:'generations/0123456789abcdef'}};
 const read=async p=>{if(!(p in files))throw Error('404');return structuredClone(files[p]);};
 assert.deepEqual((await investorRows('005930','institution','live','3m',read)).map(r=>r.date),['d1']);
 await assert.rejects(investorRows('005930','private','live','3m',read),/manifest/);
 await assert.rejects(investorRows('../x','institution','live','3m',read),/invalid/);
});
test('volume labels stay compact',()=>{assert.equal(compactVolume(123456789),'1.2억');assert.equal(compactVolume(55000),'6만');assert.equal(compactVolume(900),'900');});
