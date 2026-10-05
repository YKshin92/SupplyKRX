import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {parseCsv,rowsCsv,importedDataset,previousSession,summarize} from '../src/data.ts';
const sample=(date='2026-09-01',net=10)=>({date,code:'005930',name:'삼성전자',market:'KOSPI',investor:'연기금 등',scope:'KRX',buy:100+net,sell:100,net,buy_volume:null,sell_volume:null,net_volume:null,close:70000,change_pct:0,volume:10,turnover:1000,source:'test',collected_at:'2026-09-01T20:00:00+09:00',finality:'unknown'});
describe('CSV and metrics',()=>{
 it('accepts new alphanumeric KRX codes',()=>{assert.equal(parseCsv(rowsCsv([{...sample(),code:'0001A0'}]))[0].code,'0001A0');});
 it('preserves ticker zeros and numerical units',()=>{const rows=parseCsv(rowsCsv([sample()]));assert.equal(rows[0].code,'005930');assert.equal(rows[0].buy,110);});
 it('rejects duplicate and inconsistent inputs',()=>{assert.throws(()=>parseCsv(rowsCsv([sample(),sample()])),/중복/);assert.throws(()=>parseCsv(rowsCsv([{...sample(),net:999}])),/불일치/);});
 it('requires calendar to claim rolling metrics',()=>{const d=importedDataset([sample()]);assert.equal(d.stocks[0].streak,null);assert.equal(d.manifest.status,'calendar_unverified');});
 it('does not call weekend the prior session',()=>{const d=importedDataset([sample('2026-09-04')],{sessions:['2026-09-04'],checked_through:'2026-09-06',source:'test'});assert.equal(previousSession(d.manifest,'2026-09-07'),'2026-09-04');assert.equal(previousSession(d.manifest,'2026-09-08'),null);});
 it('does not turn gaps into zeros',()=>{const s=summarize([sample('2026-09-01'),sample('2026-09-03')],['2026-09-01','2026-09-02','2026-09-03'],'2026-09-03');assert.equal(s.streak,null);assert.deepEqual(s.spark,[10,null,10]);});
 it('includes zero net when both sides traded',()=>{const s=summarize([sample('2026-09-01',0)],['2026-09-01'],'2026-09-01');assert.equal(s.active,true);assert.equal(s.streak,0);});
 it('cannot infer activity from net zero alone',()=>{const s=summarize([{...sample('2026-09-01',0),buy:null,sell:null}],['2026-09-01'],'2026-09-01');assert.equal(s.active,null);});
 it('rejects mixed scopes and demo/live',()=>{assert.throws(()=>importedDataset([sample(),{...sample('2026-09-02'),scope:'NXT'}]),/거래 범위/);assert.throws(()=>importedDataset([sample(),{...sample('2026-09-02'),finality:'demo'}]),/섞을/);});
});
