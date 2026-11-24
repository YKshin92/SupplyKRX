// 시장 현황 실시간 시세 (반도체 지수 SOXX, 미국 지수·시가총액 상위 50). Signed-in users only (the proxy checks too).
// Sources: Finnhub /quote for stocks and ETFs (key only in the Vercel environment variable FINNHUB_API_KEY, sent as a header);
// Yahoo Finance chart API for indices (^GSPC, ^IXIC) — the free Finnhub plan does not quote indices, and the daily index
// bars already come from Yahoo. Yahoo calls do not count against the Finnhub budget.
// Free plan limits: 60 calls/minute and 30 calls/second. This server instance therefore
//  - caches each symbol for 55 seconds (so every open tab together costs one call per symbol per minute),
//  - spends at most BUDGET calls per rolling minute (the rest answer from the last value or 'budget'),
//  - calls in groups of GROUP with a pause between groups (under 30 per second).
// ?symbol=SOXX answers one quote (the SOXX view); ?symbols=A,B,... (≤ 60) answers {quotes, missing}.
const SYMBOL=/^\^?[A-Z][A-Z0-9.-]{0,9}$/;
const MAX=60,TTL=55_000,BUDGET=55,GROUP=10,PAUSE=450,BLOCK=3_600_000;
const shared={cache:new Map(),calls:[],blocked:new Map()};
async function signedIn(req,res){
 const {sessionUser}=await import('../server/auth.js');
 try{await sessionUser(req);return true;}
 catch(error){res.status(error.status??401).json({error:error.status===503?'로그인 설정이 필요합니다.':error.status===403?'접근 권한이 없는 계정입니다.':'로그인이 필요합니다.'});}
 return false;
}
const finite=v=>typeof v==='number'&&Number.isFinite(v);
/** Finnhub answers {c,d,dp,h,l,o,pc,t}; an unknown symbol comes back as zeros, which is not a price. */
export function parseQuote(symbol,q,now=Date.now()){
 if(!q||!finite(q.c)||!finite(q.t)||q.c<=0||q.t<=0)return null;
 const n=v=>finite(v)&&v>0?v:null;
 return {symbol,price:q.c,open:n(q.o),high:n(q.h),low:n(q.l),prev_close:n(q.pc),change:finite(q.d)?q.d:null,change_pct:finite(q.dp)?q.dp:null,
  time:new Date(q.t*1000).toISOString(),fetched_at:new Date(now).toISOString(),source:'Finnhub'};
}
/** Yahoo chart meta → the same quote shape. chartPreviousClose (range=1d) is the previous session's close. */
export function parseYahoo(symbol,j,now=Date.now()){
 const r=j?.chart?.result?.[0],m=r?.meta;
 if(!m||!finite(m.regularMarketPrice)||m.regularMarketPrice<=0||!finite(m.regularMarketTime)||m.regularMarketTime<=0)return null;
 const n=v=>finite(v)&&v>0?v:null,price=m.regularMarketPrice,prev=n(m.chartPreviousClose)??n(m.previousClose);
 const open=r.indicators?.quote?.[0]?.open?.at?.(-1);
 return {symbol,price,open:n(open),high:n(m.regularMarketDayHigh),low:n(m.regularMarketDayLow),prev_close:prev,change:prev?price-prev:null,change_pct:prev?(price/prev-1)*100:null,
  time:new Date(m.regularMarketTime*1000).toISOString(),fetched_at:new Date(now).toISOString(),source:'Yahoo Finance'};
}
const YAHOO='https://query1.finance.yahoo.com/v8/finance/chart/{}?interval=1d&range=1d&includePrePost=false';
/** Yahoo-style class shares (BRK-B) are BRK.B on Finnhub. */
export const finnhubSymbol=s=>s.replace(/-/g,'.');
class KeyRejected extends Error{}
export function createQuoteHandler(authorize=signedIn,{fetchImpl=fetch,env=process.env,now=()=>Date.now(),store=shared,wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const state=store instanceof Map?{cache:store,calls:[],blocked:new Map()}:store;
 const spend=()=>{const t=now();state.calls=state.calls.filter(x=>t-x<60_000);if(state.calls.length>=BUDGET)return false;state.calls.push(t);return true;};
 async function one(symbol){
  const hit=state.cache.get(symbol);
  if(hit&&now()-hit.at<TTL)return {quote:hit.body};
  if(symbol.startsWith('^')){
   try{
    const r=await fetchImpl(YAHOO.replace('{}',encodeURIComponent(symbol)),{headers:{'User-Agent':'Mozilla/5.0 (X11; Linux x86_64)'},signal:AbortSignal.timeout(8000)});
    const body=r.ok?parseYahoo(symbol,await r.json().catch(()=>null),now()):null;
    if(!body)return {quote:hit?.body??null,missing:r.ok?'empty':'upstream'};
    state.cache.set(symbol,{at:now(),body});
    return {quote:body};
   }catch{return {quote:hit?.body??null,missing:'unreachable'};}
  }
  const blocked=state.blocked.get(symbol);
  if(blocked&&now()-blocked<BLOCK)return {quote:hit?.body??null,missing:'no_access'};
  if(!spend())return {quote:hit?.body??null,missing:'budget'};
  let r;
  try{r=await fetchImpl(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(finnhubSymbol(symbol))}`,{headers:{'X-Finnhub-Token':env.FINNHUB_API_KEY},signal:AbortSignal.timeout(8000)});}
  catch{return {quote:hit?.body??null,missing:'unreachable'};}
  if(r.status===401)throw new KeyRejected();
  if(r.status===403){state.blocked.set(symbol,now());return {quote:null,missing:'no_access'};}
  if(r.status===429)return {quote:hit?.body??null,missing:'rate_limited'};
  if(!r.ok)return {quote:hit?.body??null,missing:'upstream'};
  const body=parseQuote(symbol,await r.json().catch(()=>null),now());
  if(!body)return {quote:null,missing:'empty'};
  state.cache.set(symbol,{at:now(),body});
  return {quote:body};
 }
 return async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'GET만 지원합니다.'});}
  if(!await authorize(req,res))return;
  const multi=req.query?.symbols!=null;
  const list=[...new Set(String(multi?req.query.symbols:req.query?.symbol??'SOXX').toUpperCase().split(',').map(s=>s.trim()).filter(Boolean))];
  if(!list.length||list.length>MAX||!list.every(s=>SYMBOL.test(s)))return res.status(400).json({error:'지원하지 않는 종목입니다.'});
  if(!env.FINNHUB_API_KEY)return res.status(503).json({error:'not_configured',message:'실시간 시세 키(FINNHUB_API_KEY)가 아직 설정되지 않았습니다.'});
  try{
   const out={};
   for(let i=0;i<list.length;i+=GROUP){
    if(i)await wait(PAUSE);
    const part=list.slice(i,i+GROUP);
    (await Promise.all(part.map(one))).forEach((x,j)=>{out[part[j]]=x;});
   }
   if(!multi){
    const x=out[list[0]];
    if(x.quote)return res.status(200).json(x.quote);
    const message={no_access:'무료 키로는 이 종목 시세를 받을 수 없습니다.',budget:'분당 호출 한도에 가까워 잠시 쉽니다.',rate_limited:'Finnhub 호출 한도(분당 60회)에 걸렸습니다. 잠시 뒤 다시 시도합니다.',empty:'Finnhub가 이 종목 시세를 주지 않았습니다.',unreachable:'Finnhub에 연결하지 못했습니다.'}[x.missing]??`Finnhub 응답 오류`;
    return res.status(x.missing==='budget'||x.missing==='rate_limited'?503:502).json({error:x.missing,message});
   }
   const quotes={},missing={};
   for(const [s,x] of Object.entries(out)){if(x.quote)quotes[s]=x.quote;if(x.missing)missing[s]=x.missing;}
   return res.status(200).json({quotes,missing,fetched_at:new Date(now()).toISOString()});
  }catch(error){
   if(error instanceof KeyRejected)return res.status(502).json({error:'key_rejected',message:'Finnhub가 키를 거부했습니다. 키를 확인해 주세요.'});
   return res.status(502).json({error:'unreachable',message:'Finnhub에 연결하지 못했습니다.'});
  }
 };
}
export default createQuoteHandler();
