import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTradingHandler} from '../api/trading.js';
import {createProxy} from '../proxy.js';
function response(){return {headers:{},code:0,body:null,setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},json(v){this.body=v;return this;}};}
const post=body=>({method:'POST',headers:{origin:'https://supply-krx.vercel.app','x-trading-request':'1'},query:{},body});
const get={method:'GET',headers:{},query:{}};
const env={GITHUB_COLLECTION_TOKEN:'test-placeholder'};
const file=obj=>({encoding:'base64',size:100,content:Buffer.from(JSON.stringify(obj)).toString('base64')});
function github(files={},runs=[]){const calls=[];return {calls,fetchImpl:async(url,options)=>{calls.push({url,options});
 if(url.endsWith('/dispatches'))return new Response(null,{status:204});
 if(url.includes('/runs?'))return new Response(JSON.stringify({workflow_runs:runs}),{status:200});
 const m=url.match(/\/contents\/trading\/([a-z]+\.json)\?ref=trading-state$/);if(m)return files[m[1]]?new Response(JSON.stringify(files[m[1]]),{status:200}):new Response('{}',{status:404});
 return new Response('{}',{status:500});}};}
test('only admins; cross-site posts and non-admins never reach GitHub',async()=>{
 const g=github();let res=response();
 await createTradingHandler(async(req,r)=>{r.status(403).json({error:'admin'});return false;},{...g,env})(get,res);assert.equal(res.code,403);
 res=response();await createTradingHandler(async()=>true,{...g,env})({...post({action:'stop'}),headers:{origin:'https://evil.example','x-trading-request':'1'}},res);assert.equal(res.code,403);
 res=response();await createTradingHandler(async()=>true,{...g,env})({...post({action:'stop'}),headers:{origin:'https://supply-krx.vercel.app'}},res);assert.equal(res.code,403);
 assert.equal(g.calls.length,0);
 const member=createProxy(async()=>({id:'viewer',isAdmin:false}));assert.equal((await member(new Request('https://supply-krx.vercel.app/api/trading'))).status,403);
 const admin=createProxy(async()=>({id:'owner',isAdmin:true}));assert.equal((await admin(new Request('https://supply-krx.vercel.app/api/trading'))).headers.get('x-middleware-next'),'1');
});
test('reads the bot state and the stop flag from the trading-state branch; empty before the bot connects',async()=>{
 let g=github();let res=response();await createTradingHandler(async()=>true,{...g,env})(get,res);
 assert.equal(res.code,200);assert.equal(res.body.state,null);assert.equal(res.body.control,null);
 g=github({'state.json':file({schema:1,mode:'paper'}),'control.json':file({stopped:true})});res=response();
 await createTradingHandler(async()=>true,{...g,env})(get,res);
 assert.equal(res.body.state.mode,'paper');assert.equal(res.body.control.stopped,true);assert.ok(!JSON.stringify(res.body).includes('test-placeholder'));
 g=github({'state.json':file({schema:9})});res=response();await createTradingHandler(async()=>true,{...g,env})(get,res);assert.equal(res.code,502);
});
test('stop/resume dispatch the control workflow with a validated action; a running request blocks another',async()=>{
 for(const body of [{action:'buy'},{action:'stop; rm'},{}]){const g=github();const res=response();await createTradingHandler(async()=>true,{...g,env})(post(body),res);assert.equal(res.code,400);assert.ok(!g.calls.some(c=>c.url.endsWith('/dispatches')));}
 let g=github();let res=response();await createTradingHandler(async()=>true,{...g,env})(post({action:'stop'}),res);
 assert.equal(res.code,202);const d=g.calls.find(c=>c.url.endsWith('/actions/workflows/trading-control.yml/dispatches'));assert.deepEqual(JSON.parse(d.options.body),{ref:'main',inputs:{action:'stop'}});
 g=github({},[{status:'queued'}]);res=response();await createTradingHandler(async()=>true,{...g,env})(post({action:'resume'}),res);assert.equal(res.code,409);
});
test('missing credential and GitHub permission errors are explicit',async()=>{
 let res=response();await createTradingHandler(async()=>true,{env:{}})(get,res);assert.equal(res.code,503);
 res=response();await createTradingHandler(async()=>true,{fetchImpl:async()=>new Response('{}',{status:403}),env})(get,res);assert.equal(res.code,502);assert.match(res.body.error,/Contents 읽기/);
});
