import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createQuoteHandler,parseQuote} from '../api/quote.js';
function response(){return {headers:{},code:0,body:null,setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},json(v){this.body=v;return this;}};}
const get=(symbol='SOXX')=>({method:'GET',headers:{},query:{symbol}});
const ok=async()=>true;
const finnhub=(body,status=200)=>{const calls=[];return {calls,fetchImpl:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(body),{status});}};};
const Q={c:147.1,d:6.9,dp:4.92,h:148,l:141.5,o:142,pc:140.2,t:1795546800};
test('signed-out requests and other symbols never reach Finnhub',async()=>{
 const f=finnhub(Q);
 const no=createQuoteHandler(async(req,res)=>{res.status(401).json({error:'로그인이 필요합니다.'});return false;},{fetchImpl:f.fetchImpl,env:{FINNHUB_API_KEY:'test-placeholder'},store:new Map()});
 let res=response();await no(get(),res);assert.equal(res.code,401);
 const h=createQuoteHandler(ok,{fetchImpl:f.fetchImpl,env:{FINNHUB_API_KEY:'test-placeholder'},store:new Map()});
 res=response();await h(get('AAPL'),res);assert.equal(res.code,400);
 res=response();await h({...get(),method:'POST'},res);assert.equal(res.code,405);
 assert.equal(f.calls.length,0);
});
test('missing key is reported without a call',async()=>{
 const f=finnhub(Q),res=response();
 await createQuoteHandler(ok,{fetchImpl:f.fetchImpl,env:{},store:new Map()})(get(),res);
 assert.equal(res.code,503);assert.equal(res.body.error,'not_configured');assert.equal(f.calls.length,0);
});
test('key goes in a header, the answer is parsed and cached for 15 seconds',async()=>{
 const f=finnhub(Q);let t=1_000_000;const h=createQuoteHandler(ok,{fetchImpl:f.fetchImpl,env:{FINNHUB_API_KEY:'test-placeholder'},now:()=>t,store:new Map()});
 let res=response();await h(get('soxx'),res);
 assert.equal(res.code,200);assert.equal(res.body.price,147.1);assert.equal(res.body.prev_close,140.2);assert.equal(res.body.time,new Date(Q.t*1000).toISOString());
 assert.ok(!f.calls[0].url.includes('token='));assert.equal(f.calls[0].options.headers['X-Finnhub-Token'],'test-placeholder');
 assert.ok(!JSON.stringify(res.body).includes('test-placeholder'));
 t+=10_000;res=response();await h(get(),res);assert.equal(f.calls.length,1);
 t+=10_000;res=response();await h(get(),res);assert.equal(f.calls.length,2);
});
test('rejected key, rate limit and empty quotes become clear errors',async()=>{
 for(const [body,status,code,error] of [[{},401,502,'key_rejected'],[{},429,503,'rate_limited'],[{c:0,d:null,dp:null,h:0,l:0,o:0,pc:0,t:0},200,502,'empty']]){
  const f=finnhub(body,status),res=response();
  await createQuoteHandler(ok,{fetchImpl:f.fetchImpl,env:{FINNHUB_API_KEY:'test-placeholder'},store:new Map()})(get(),res);
  assert.equal(res.code,code);assert.equal(res.body.error,error);
 }
 assert.equal(parseQuote('SOXX',null),null);
});
