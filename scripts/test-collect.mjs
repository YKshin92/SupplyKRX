import {test} from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/collect.js';
function response(){return {headers:{},code:0,body:null,setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},json(v){this.body=v;return this;}};}
const request={method:'POST',headers:{origin:'https://supply-krx.vercel.app','x-collection-request':'1'},query:{}};
test('manual collection rejects cross-origin requests before calling GitHub',async()=>{
 const res=response();await handler({...request,headers:{...request.headers,origin:'https://example.com'}},res);assert.equal(res.code,403);
});
test('missing server credential fails explicitly without dispatching',async()=>{
 const old=process.env.GITHUB_COLLECTION_TOKEN;delete process.env.GITHUB_COLLECTION_TOKEN;
 try{const res=response();await handler(request,res);assert.equal(res.code,503);}finally{if(old)process.env.GITHUB_COLLECTION_TOKEN=old;}
});
test('existing active job is reused and completed jobs can trigger a new dispatch',async()=>{
 const original=globalThis.fetch;const old=process.env.GITHUB_COLLECTION_TOKEN;process.env.GITHUB_COLLECTION_TOKEN='test-placeholder';
 try{
  let calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({workflow_runs:[{id:123,status:'in_progress',created_at:'2020-01-01'}]}),{status:200});};
  let res=response();await handler(request,res);assert.equal(res.body.run.id,123);assert.equal(calls.length,1);assert.equal(res.body.reused,true);assert.ok(!JSON.stringify(res.body).includes('test-placeholder'));
  calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options});return url.endsWith('/dispatches')?new Response(null,{status:204}):new Response(JSON.stringify({workflow_runs:[]}),{status:200});};
  res=response();await handler(request,res);assert.equal(res.code,202);assert.equal(calls.length,2);assert.equal(calls[1].options.method,'POST');assert.equal(calls[1].options.body,'{"ref":"main"}');
 }finally{globalThis.fetch=original;if(old)process.env.GITHUB_COLLECTION_TOKEN=old;else delete process.env.GITHUB_COLLECTION_TOKEN;}
});
