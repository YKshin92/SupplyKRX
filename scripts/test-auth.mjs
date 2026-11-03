import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateToken,sessionUser,sessionCookie} from '../server/auth.js';
import {createAuthHandler} from '../api/auth.js';
import {createProxy} from '../proxy.js';
import DescopeClient from '@descope/node-sdk';
import {generateKeyPairSync,sign} from 'node:crypto';
const env={DESCOPE_PROJECT_ID:'test-project',COLLECTION_ADMIN_USER_IDS:'owner-id'};
const token='header.payload.signature';
const claims={sub:'owner-id',exp:Math.floor(Date.now()/1000)+300,aud:'test-project'};
const verify=async(jwt,options)=>{assert.equal(options.audience,'test-project');return {token:claims};};
function response(){return {headers:{},code:0,body:null,setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},json(v){this.body=v;return this;}};}
test('official SDK rejects cryptographically tampered JWT, incorrect audience/issuer and expired tokens',async()=>{
 const keys=generateKeyPairSync('rsa',{modulusLength:2048});const jwk={...keys.publicKey.export({format:'jwk'}),kid:'local-test-key',alg:'RS256'};
 const client=DescopeClient({projectId:env.DESCOPE_PROJECT_ID,publicKey:JSON.stringify(jwk)});
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const jwt=payload=>{const value=encode({alg:'RS256',kid:jwk.kid})+'.'+encode(payload);return value+'.'+sign('RSA-SHA256',Buffer.from(value),keys.privateKey).toString('base64url');};
 const verify=(value,options)=>client.validateSession(value,options);
 const valid=jwt({...claims,iss:env.DESCOPE_PROJECT_ID});assert.equal((await validateToken(valid,{env,verify})).isAdmin,true);
 const parts=valid.split('.');parts[1]=encode({...claims,sub:'attacker',iss:env.DESCOPE_PROJECT_ID});
 for(const invalid of [parts.join('.'),jwt({...claims,aud:'wrong',iss:env.DESCOPE_PROJECT_ID}),jwt({...claims,iss:'wrong'}),jwt({...claims,iss:env.DESCOPE_PROJECT_ID,exp:1})])await assert.rejects(validateToken(invalid,{env,verify}),{status:401});
});
test('verified subject allowlist determines administrator; request fields cannot grant access',async()=>{
 assert.equal((await validateToken(token,{env,verify})).isAdmin,true);
 assert.equal((await validateToken(token,{env,verify:async()=>({token:{...claims,sub:'viewer-id',isAdmin:true,roles:['viewer']}})})).isAdmin,false);
 await assert.rejects(sessionUser({headers:{'x-user-id':'owner-id'}},{env,verify}),{status:401});
});
test('a member ID list admits exactly those IDs and ignores roles',async()=>{
 const e={...env,MEMBER_USER_IDS:'guest-id'};const as=(sub,extra={})=>({env:e,verify:async()=>({token:{...claims,sub,...extra}})});
 assert.equal((await validateToken(token,as('guest-id'))).isAdmin,false);
 await assert.rejects(validateToken(token,as('someone',{roles:['viewer']})),{status:403});
 assert.equal((await validateToken(token,as('owner-id'))).isAdmin,true);
});
test('administrators may be listed in either admin variable',async()=>{
 const as=sub=>({env:{...env,ADMIN_USER_IDS:' master-id , '},verify:async()=>({token:{...claims,sub}})});
 assert.equal((await validateToken(token,as('master-id'))).isAdmin,true);assert.equal((await validateToken(token,as('owner-id'))).isAdmin,true);
 await assert.rejects(validateToken(token,as('')),{status:401});await assert.rejects(validateToken(token,as('someone')),{status:403});
});
test('only issued accounts enter: admin IDs or the member role; self sign-ups are refused',async()=>{
 const as=extra=>({env,verify:async()=>({token:{...claims,sub:'someone',...extra}})});
 assert.deepEqual(await validateToken(token,as({roles:['viewer']})),{id:'someone',isAdmin:false,expiresAt:claims.exp});
 for(const extra of [{},{roles:[]},{roles:['Viewer']},{roles:'viewer'},{roles:[['viewer']]},{isAdmin:true},{permissions:['viewer']},{tenants:{t1:{roles:['viewer']}}}])await assert.rejects(validateToken(token,as(extra)),{status:403});
 assert.equal((await validateToken(token,{env:{...env,MEMBER_ROLE:'guest-pass'},verify:async()=>({token:{...claims,sub:'someone',roles:['guest-pass']}})})).isAdmin,false);
 await assert.rejects(validateToken(token,{env:{...env,MEMBER_ROLE:''},verify:async()=>({token:{...claims,sub:'someone',roles:['']}})}),{status:403});
 assert.equal((await validateToken(token,{env,verify:async()=>({token:{...claims,roles:[]}})})).isAdmin,true,'admin needs no role');
 const handler=createAuthHandler({env,verify:async()=>({token:{...claims,sub:'someone'}})});
 let res=response();await handler({method:'POST',query:{action:'session'},headers:{origin:'https://supply-krx.vercel.app'},body:{sessionToken:token}},res);
 assert.equal(res.code,403);assert.match(res.headers['Set-Cookie'],/Max-Age=0/);assert.match(res.body.error,/관리자/);
 res=response();await handler({method:'GET',query:{action:'me'},headers:{cookie:`${sessionCookie}=${token}`}},res);assert.equal(res.code,403);
 const proxy=createProxy(async()=>{throw Object.assign(new Error(),{status:403});});
 assert.equal((await proxy(new Request('https://supply-krx.vercel.app/data/live/manifest.json'))).status,403);
});
test('missing, malformed, duplicate, expired and wrong project sessions fail closed',async()=>{
 for(const value of ['',null,'tampered','a.b.c;Cookie=evil'])await assert.rejects(validateToken(value,{env,verify}),{status:401});
 for(const invalid of [{...claims,exp:1},{...claims,aud:'other-project'},{...claims,sub:''}])await assert.rejects(validateToken(token,{env,verify:async()=>({token:invalid})}),{status:401});
 await assert.rejects(validateToken(token,{env,verify:async()=>{throw new Error('bad signature');}}),{status:401});
 await assert.rejects(sessionUser({headers:{cookie:`${sessionCookie}=${token}; ${sessionCookie}=${token}`}},{env,verify}),{status:401});
 await assert.rejects(validateToken(token,{env:{},verify}),{status:503});
});
test('session exchange rejects cross-site calls and stores only verified JWT in secure HttpOnly cookie',async()=>{
 const handler=createAuthHandler({env,verify});const req={method:'POST',query:{action:'session'},headers:{origin:'https://supply-krx.vercel.app'},body:{sessionToken:token}};
 let res=response();await handler({...req,headers:{origin:'https://evil.example'}},res);assert.equal(res.code,403);assert.equal(res.headers['Set-Cookie'],undefined);
 res=response();await handler(req,res);assert.equal(res.code,200);assert.ok(res.headers['Set-Cookie'].includes('HttpOnly; Secure; SameSite=Lax'));assert.ok(res.headers['Set-Cookie'].startsWith('__Host-'));assert.equal(res.headers['Cache-Control'],'private, no-store');assert.equal(res.body.sessionToken,undefined);
 res=response();await handler({method:'GET',query:{action:'me'},headers:{cookie:`${sessionCookie}=${token}`}},res);assert.equal(res.body.id,'owner-id');
 res=response();await handler({...req,query:{action:'logout'}},res);assert.match(res.headers['Set-Cookie'],/Max-Age=0/);
});
test('encoded, doubled or malformed paths are checked like plain ones',async()=>{
 const guest=createProxy(async()=>{throw Object.assign(new Error(),{status:401});});
 for(const path of ['//data/live/manifest.json','/%64ata/live/manifest.json','/data//live/manifest.json'])assert.equal((await guest(new Request('https://supply-krx.vercel.app'+path))).status,401,path);
 assert.equal((await guest(new Request('https://supply-krx.vercel.app/data/live/%E0%A4%A.json'))).status,400);
});
test('middleware protects static data before cache, allows member viewing but rejects member collection and CSV',async()=>{
 const guest=createProxy(async()=>{throw Object.assign(new Error(),{status:401});});
 for(const path of ['/data/live/manifest.json','/data/live/periods/3m/summary.json','/api/collect','/api/strategy'])assert.equal((await guest(new Request('https://supply-krx.vercel.app'+path))).status,401);
 assert.equal((await guest(new Request('https://supply-krx.vercel.app/api/auth?action=config'))).headers.get('x-middleware-next'),'1');
 const member=createProxy(async()=>({id:'viewer-id',isAdmin:false}));
 let res=await member(new Request('https://supply-krx.vercel.app/data/live/manifest.json'));assert.equal(res.headers.get('x-middleware-next'),'1');assert.equal(res.headers.get('cache-control'),'private, no-store');
 assert.equal((await member(new Request('https://supply-krx.vercel.app/api/collect'))).status,403);
 assert.equal((await member(new Request('https://supply-krx.vercel.app/api/strategy'))).status,403);
 for(const path of ['/data/live/signal-lab/latest.json','/data/live/strategy-candidates.json','/api/trading','/data/live/signal%2Dlab/latest.json','/data//live/strategy-candidates.json','//data/live/signal-lab/latest.json'])assert.equal((await member(new Request('https://supply-krx.vercel.app'+path))).status,403,path);
 for(const path of ['/data/live/simulation-input.json','/data/live/entry-events.json','/data/live/flow-ranks/x.json','/data/live/signal-labs.json'])assert.equal((await member(new Request('https://supply-krx.vercel.app'+path))).headers.get('x-middleware-next'),'1',path);
 assert.equal((await member(new Request('https://supply-krx.vercel.app/data/live/export.csv'))).status,403);
 const admin=createProxy(async()=>({id:'owner-id',isAdmin:true}));assert.equal((await admin(new Request('https://supply-krx.vercel.app/api/collect'))).headers.get('x-middleware-next'),'1');
 assert.equal((await admin(new Request('https://supply-krx.vercel.app/data/live/signal-lab/latest.json'))).headers.get('x-middleware-next'),'1');
});
