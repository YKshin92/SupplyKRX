import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStrategyHandler} from '../api/strategy.js';
function response(){return {headers:{},code:0,body:null,setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},json(v){this.body=v;return this;}};}
const post=(body)=>({method:'POST',headers:{origin:'https://supply-krx.vercel.app','x-strategy-request':'1'},query:{},body});
function github(runs){const calls=[];return {calls,fetchImpl:async(url,options)=>{calls.push({url,options});return url.endsWith('/dispatches')?new Response(null,{status:204}):new Response(JSON.stringify({workflow_runs:runs}),{status:200});}};}
const env={GITHUB_COLLECTION_TOKEN:'test-placeholder'};
test('non-admin and cross-origin requests never reach GitHub',async()=>{
 const g=github([]);let res=response();
 await createStrategyHandler(async(req,r)=>{r.status(403).json({error:'admin'});return false;},{...g,env})(post({action:'approve',id:'c001-quiet-sell-under-1e8'}),res);
 assert.equal(res.code,403);assert.equal(g.calls.length,0);
 res=response();await createStrategyHandler(async()=>true,{...g,env})({...post({action:'apply'}),headers:{origin:'https://example.com','x-strategy-request':'1'}},res);
 assert.equal(res.code,403);assert.equal(g.calls.length,0);
});
test('missing server credential fails explicitly',async()=>{const res=response();await createStrategyHandler(async()=>true,{env:{}})(post({action:'apply'}),res);assert.equal(res.code,503);});
test('invalid actions and ids are rejected before dispatch',async()=>{
 for(const body of [{action:'delete',id:'c001-a'},{action:'approve',id:'../x'},{action:'approve'},{action:'apply',id:'c001-a'}]){
  const g=github([]);const res=response();await createStrategyHandler(async()=>true,{...g,env})(post(body),res);
  assert.equal(res.code,400,JSON.stringify(body));assert.ok(!g.calls.some(c=>c.url.endsWith('/dispatches')));
 }
});
test('a decision is dispatched with validated inputs, and a running decision blocks a second one',async()=>{
 let g=github([]);let res=response();await createStrategyHandler(async()=>true,{...g,env})(post({action:'approve',id:'c001-quiet-sell-under-1e8'}),res);
 assert.equal(res.code,202);const d=g.calls.find(c=>c.url.endsWith('/workflows/strategy-decision.yml/dispatches'));
 assert.deepEqual(JSON.parse(d.options.body),{ref:'main',inputs:{action:'approve',id:'c001-quiet-sell-under-1e8'}});
 assert.ok(!JSON.stringify(res.body).includes('test-placeholder'));
 g=github([{id:5,status:'in_progress',created_at:'2026-11-03T00:00:00Z'}]);res=response();
 await createStrategyHandler(async()=>true,{...g,env})(post({action:'apply'}),res);assert.equal(res.code,409);assert.ok(!g.calls.some(c=>c.url.endsWith('/dispatches')));
});
test('run lookup only returns this workflow',async()=>{
 const fetchImpl=async()=>new Response(JSON.stringify({id:9,status:'completed',conclusion:'success',path:'.github/workflows/collect.yml'}),{status:200});
 const res=response();await createStrategyHandler(async()=>true,{fetchImpl,env})({method:'GET',headers:{},query:{run:'9'}},res);assert.equal(res.code,404);
});
