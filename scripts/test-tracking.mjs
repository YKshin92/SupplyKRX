import test from 'node:test';
import assert from 'node:assert/strict';
import {registrations,visibleTracking} from '../src/tracking.ts';
import {buyScore} from '../src/buy-score.ts';
test('score handles missing data, selling, caps and excludes outcomes',()=>{
 const e={signal_buy:30e8,signal_net:30e8,foreign_buy:30e8,foreign_net:30e8,market_cap:30e11,prior:{10:{max_buy:0,max_sell:0,avg_gross:0,absent_days:0}}};
 assert.equal(buyScore(e).total,100);
 assert.equal(buyScore({...e,foreign_buy:null}).total,null);
 assert.equal(buyScore({...e,market_cap:0}).total,null);
 assert.equal(buyScore({...e,foreign_net:-1}).total,85);
 assert.equal(buyScore({...e,current_return:-99,tracking_days:100}).total,100);
 assert.ok(buyScore({...e,signal_net:1e8}).total<100);
 assert.equal(buyScore({...e,prior:{}}).total,100);
 assert.deepEqual(buyScore(e).parts.map(p=>p.max),[50,35,15]);
 assert.equal(buyScore({...e,prior:{10:{max_buy:1e8,max_sell:1e8,avg_gross:2e8}}}).total,100);
});
const event=(code,date,extra={})=>({code,signal_date:date,signal_net:6e8,tracking_days:4,buy_days:2,buy_days_complete:true,no_net_sale:true,no_gross_sale:false,prior:{10:{max_buy:1e7,max_sell:2e7},20:null},...extra});
test('gross thresholds, strict mode and earliest qualifying registration',()=>{
 const first=event('1','2026-09-01'),later=event('1','2026-10-01'),capped=event('2','2026-10-01',{prior:{10:{max_buy:0,max_sell:1e8}}});
 assert.deepEqual(registrations([later,capped,first],10,1,false,5),[first]);
 assert.equal(registrations([first],10,1,true,5).length,0);
 assert.equal(registrations([first],20,1,false,5).length,0);
 assert.equal(registrations([first],10,1,false,7).length,0);
});
test('trading-day age and retained history',()=>{
 const old=event('1','2026-09-01',{tracking_days:10}),newest=event('2','2026-10-01',{tracking_days:4}),edge=event('3','2026-09-30',{tracking_days:5});
 assert.deepEqual(visibleTracking([old,newest,edge],'new','net',[]),[newest]);
 assert.deepEqual(visibleTracking([old,newest,edge],'recent','net',[]),[newest,edge]);
 assert.equal(visibleTracking([old,newest,edge],'all','all',[]).length,3);
 assert.deepEqual(visibleTracking([old,newest],'watch','all',['1']),[old]);
});
test('gross versus net sales and missing sustained observations',()=>{
 const small=event('1','2026-10-01'),missing=event('2','2026-10-01',{no_net_sale:null,buy_days_complete:false}),one=event('3','2026-10-01',{buy_days:1});
 assert.deepEqual(visibleTracking([small,missing],'recent','net',[]),[small]);
 assert.equal(visibleTracking([small],'recent','gross',[]).length,0);
 assert.deepEqual(visibleTracking([small,missing,one],'sustained','all',[]),[small]);
});
