// 시장 현황 · 반도체 지수의 실시간 시세. Signed-in users only (the proxy checks too); the browser never sees the key.
// Source: Finnhub /quote (free plan: US stocks and ETFs, 60 calls/minute). The key lives only in the Vercel
// environment variable FINNHUB_API_KEY. Only whitelisted symbols are relayed, and each answer is cached for 15 seconds
// per server instance so many open tabs still make about 4 calls a minute.
const SYMBOLS=new Set(['SOXX']);
const TTL=15_000;
const cache=new Map();
async function signedIn(req,res){
 const {sessionUser}=await import('../server/auth.js');
 try{await sessionUser(req);return true;}
 catch(error){res.status(error.status??401).json({error:error.status===503?'로그인 설정이 필요합니다.':error.status===403?'접근 권한이 없는 계정입니다.':'로그인이 필요합니다.'});}
 return false;
}
const finite=v=>typeof v==='number'&&Number.isFinite(v);
/** Finnhub answers {c,d,dp,h,l,o,pc,t}; an unknown symbol or an expired key comes back as zeros, which is not a price. */
export function parseQuote(symbol,q,now=Date.now()){
 if(!q||!finite(q.c)||!finite(q.t)||q.c<=0||q.t<=0)return null;
 const n=v=>finite(v)&&v>0?v:null;
 return {symbol,price:q.c,open:n(q.o),high:n(q.h),low:n(q.l),prev_close:n(q.pc),change:finite(q.d)?q.d:null,change_pct:finite(q.dp)?q.dp:null,
  time:new Date(q.t*1000).toISOString(),fetched_at:new Date(now).toISOString(),source:'Finnhub'};
}
export function createQuoteHandler(authorize=signedIn,{fetchImpl=fetch,env=process.env,now=()=>Date.now(),store=cache}={}){return async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'GET만 지원합니다.'});}
 if(!await authorize(req,res))return;
 const symbol=String(req.query?.symbol??'SOXX').toUpperCase();
 if(!SYMBOLS.has(symbol))return res.status(400).json({error:'지원하지 않는 종목입니다.'});
 const key=env.FINNHUB_API_KEY;
 if(!key)return res.status(503).json({error:'not_configured',message:'실시간 시세 키(FINNHUB_API_KEY)가 아직 설정되지 않았습니다.'});
 const hit=store.get(symbol);
 if(hit&&now()-hit.at<TTL)return res.status(200).json(hit.body);
 try{
  const r=await fetchImpl(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}`,{headers:{'X-Finnhub-Token':key},signal:AbortSignal.timeout(8000)});
  if(r.status===401||r.status===403)return res.status(502).json({error:'key_rejected',message:'Finnhub가 키를 거부했습니다. 키를 확인해 주세요.'});
  if(r.status===429)return res.status(503).json({error:'rate_limited',message:'Finnhub 호출 한도(분당 60회)에 걸렸습니다. 잠시 뒤 다시 시도합니다.'});
  if(!r.ok)return res.status(502).json({error:'upstream',message:`Finnhub 응답 오류(${r.status})`});
  const body=parseQuote(symbol,await r.json(),now());
  if(!body)return res.status(502).json({error:'empty',message:'Finnhub가 이 종목 시세를 주지 않았습니다.'});
  store.set(symbol,{at:now(),body});
  return res.status(200).json(body);
 }catch{return res.status(502).json({error:'unreachable',message:'Finnhub에 연결하지 못했습니다.'});}
};}
export default createQuoteHandler();
