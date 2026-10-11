import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareStocks,filterProblem} from '../src/explorer.ts';
import {screenStock,emptyScreen} from '../src/screener.ts';

const stocks=[
 {code:'000001',market_cap:null,net:null,sum20:null,spark:[null]},
 {code:'000002',market_cap:200,net:-3,sum20:10,spark:[1]},
 {code:'000003',market_cap:100,net:0,sum20:20,spark:[0]},
 {code:'000004',market_cap:300,net:5,sum20:30,spark:[1]},
];
test('ascending and descending market cap keep missing values last',()=>{
 assert.deepEqual([...stocks].sort((a,b)=>compareStocks(a,b,'capDesc')).map(s=>s.code),['000004','000002','000003','000001']);
 assert.deepEqual([...stocks].sort((a,b)=>compareStocks(a,b,'capAsc')).map(s=>s.code),['000003','000002','000004','000001']);
});
test('amount headers preserve zero, signs, and missing data in both directions',()=>{
 assert.deepEqual([...stocks].sort((a,b)=>compareStocks(a,b,'netAsc')).map(s=>s.net),[-3,0,5,null]);
 assert.deepEqual([...stocks].sort((a,b)=>compareStocks(a,b,'net')).map(s=>s.net),[5,0,-3,null]);
});
test('missing daily observations remain last when sorting by buy days',()=>{
 assert.equal([...stocks].sort((a,b)=>compareStocks(a,b,'daysAsc')).at(-1).code,'000001');
 assert.equal([...stocks].sort((a,b)=>compareStocks(a,b,'days')).at(-1).code,'000001');
});
test('filter validation follows selected coverage and catches conflicting caps',()=>{
 assert.equal(filterProblem({...emptyScreen,days:'60'},60),'');
 assert.ok(filterProblem({...emptyScreen,days:'60'},20));
 assert.ok(filterProblem({...emptyScreen,days:'1.5'},60));
 assert.ok(filterProblem({...emptyScreen,capMin:'200',capMax:'100'},60));
});
test('no-sell preset excludes missing observations and all-zero histories',()=>{
 const f={...emptyScreen,days:'1',sellDays:'0'};
 const stock={...stocks[3],spark:Array(60).fill(0)};
 assert.equal(screenStock(stock,f,60),false);
 stock.spark[0]=1;assert.equal(screenStock(stock,f,60),true);
 stock.spark[40]=null;assert.equal(screenStock(stock,f,60),false);
});
