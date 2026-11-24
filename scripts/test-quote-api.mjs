import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createQuoteHandler,parseQuote,parseYahoo} from '../api/quote.js';
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
 res=response();await h(get('aapl;rm'),res);assert.equal(res.code,400);
 res=response();await h({...get(),method:'POST'},res);assert.equal(res.code,405);
 assert.equal(f.calls.length,0);
});
test('missing key is reported without a call',async()=>{
 const f=finnhub(Q),res=response();
 await createQuoteHandler(ok,{fetchImpl:f.fetchImpl,env:{},store:new Map()})(get(),res);
 assert.equal(res.code,503);assert.equal(res.body.error,'not_configured');assert.equal(f.calls.length,0);
});
test('key goes in a header, the answer is parsed and cached for 55 seconds',async()=>{
 const f=finnhub(Q);let t=1_000_000;const h=createQuoteHandler(ok,{fetchImpl:f.fetchImpl,env:{FINNHUB_API_KEY:'test-placeholder'},now:()=>t,store:new Map()});
 let res=response();await h(get('soxx'),res);
 assert.equal(res.code,200);assert.equal(res.body.price,147.1);assert.equal(res.body.prev_close,140.2);assert.equal(res.body.time,new Date(Q.t*1000).toISOString());
 assert.ok(!f.calls[0].url.includes('token='));assert.equal(f.calls[0].options.headers['X-Finnhub-Token'],'test-placeholder');
 assert.ok(!JSON.stringify(res.body).includes('test-placeholder'));
 t+=50_000;res=response();await h(get(),res);assert.equal(f.calls.length,1);
 t+=10_000;res=response();await h(get(),res);assert.equal(f.calls.length,2);
});
test('rejected key, rate limit and empty quotes become clear errors',async()=>{
 for(const [body,status,code,error] of [[{},401,502,'key_rejected'],[{},429,503,'rate_limited'],[{error:'no access'},403,502,'no_access'],[{c:0,d:null,dp:null,h:0,l:0,o:0,pc:0,t:0},200,502,'empty']]){
  const f=finnhub(body,status),res=response();
  await createQuoteHandler(ok,{fetchImpl:f.fetchImpl,env:{FINNHUB_API_KEY:'test-placeholder'},store:new Map()})(get(),res);
  assert.equal(res.code,code);assert.equal(res.body.error,error);
 }
 assert.equal(parseQuote('SOXX',null),null);
});

const multi=(symbols)=>({method:'GET',headers:{},query:{symbols}});
test('many symbols: grouped calls, BRK-B mapped, no-access remembered, budget respected',async()=>{
 const calls=[];let t=5_000_000;
 const fetchImpl=async(url)=>{calls.push(url);const s=new URL(url).searchParams.get('symbol');
  if(s==='LOCKED')return new Response(JSON.stringify({error:'no access'}),{status:403});
  return new Response(JSON.stringify({...Q,c:s.length}),{status:200});};
 const waits=[];
 const h=createQuoteHandler(ok,{fetchImpl,env:{FINNHUB_API_KEY:'test-placeholder'},now:()=>t,store:{cache:new Map(),calls:[],blocked:new Map()},wait:async ms=>{waits.push(ms);}});
 const syms=['LOCKED','BRK-B',...Array.from({length:48},(_,i)=>`S${i}`)];
 let res=response();await h(multi(syms.join(',')),res);
 assert.equal(res.code,200);assert.equal(calls.length,50);assert.equal(waits.length,4);
 assert.ok(calls.some(u=>u.includes('symbol=BRK.B')));assert.equal(res.body.quotes['BRK-B'].price,5);
 assert.equal(res.body.missing.LOCKED,'no_access');assert.equal(Object.keys(res.body.quotes).length,49);
 // second minute: ^GSPC is not retried for an hour; 60 more symbols exceed the 55-call budget
 t+=60_000;calls.length=0;res=response();
 await h(multi(Array.from({length:60},(_,i)=>`N${i}`).join(',')),res);
 assert.equal(calls.length,55);assert.equal(Object.values(res.body.missing).filter(x=>x==='budget').length,5);
 t+=1_000;calls.length=0;res=response();await h(multi('LOCKED'),res);assert.equal(calls.length,0);assert.equal(res.body.missing.LOCKED,'no_access');
 res=response();await h(multi(Array.from({length:61},(_,i)=>`M${i}`).join(',')),res);assert.equal(res.code,400);
});

test('indices come from Yahoo without spending the Finnhub budget',async()=>{
 const calls=[];const yahoo={chart:{result:[{meta:{regularMarketPrice:7300.5,regularMarketTime:1795545000,chartPreviousClose:7237.17,regularMarketDayHigh:7310,regularMarketDayLow:7250},indicators:{quote:[{open:[7240]}]}}]}};
 const fetchImpl=async(url,options)=>{calls.push({url,options});return url.includes('yahoo')?new Response(JSON.stringify(yahoo)):new Response(JSON.stringify(Q));};
 const h=createQuoteHandler(ok,{fetchImpl,env:{FINNHUB_API_KEY:'test-placeholder'},store:{cache:new Map(),calls:[],blocked:new Map()},wait:async()=>{}});
 const res=response();await h(multi('^GSPC,^IXIC,AAPL'),res);
 const y=calls.filter(c=>c.url.includes('yahoo'));
 assert.equal(y.length,2);assert.ok(y[0].url.includes('%5EGSPC'));assert.ok(!y[0].options.headers['X-Finnhub-Token']);
 const g=res.body.quotes['^GSPC'];assert.equal(g.price,7300.5);assert.equal(g.open,7240);assert.equal(g.source,'Yahoo Finance');assert.ok(Math.abs(g.change_pct-(7300.5/7237.17-1)*100)<1e-9);
 assert.equal(parseYahoo('^X',{chart:{result:[{meta:{regularMarketPrice:0,regularMarketTime:1}}]}}),null);
});
