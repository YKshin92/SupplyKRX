import DescopeClient from '@descope/node-sdk';

export const sessionCookie='__Host-supply-session';
const clients=new Map();
const header=(req,name)=>req.headers?.get?req.headers.get(name):req.headers?.[name];
export function config(env=process.env){return {projectId:(env.DESCOPE_PROJECT_ID??env.NEXT_PUBLIC_DESCOPE_PROJECT_ID??'').trim(),origin:env.AUTH_APP_ORIGIN??'https://supply-krx.vercel.app',admins:(env.COLLECTION_ADMIN_USER_IDS??'').split(',').map(v=>v.trim()).filter(Boolean)};}
export function sameOrigin(req,env=process.env){return header(req,'origin')===config(env).origin;}
export function cookieToken(req){const cookies=(header(req,'cookie')??'').split(';').map(v=>v.trim());const values=cookies.filter(v=>v.startsWith(sessionCookie+'='));return values.length===1?values[0].slice(sessionCookie.length+1):'';}
export async function validateToken(token,{env=process.env,verify}={}){
 const settings=config(env);
 if(!settings.projectId)throw Object.assign(new Error('auth_not_configured'),{status:503});
 if(!token||token.length>3800||!/^[-\w]+\.[-\w]+\.[-\w]+$/.test(token))throw Object.assign(new Error('invalid_session'),{status:401});
 try{
  if(!verify){if(!clients.has(settings.projectId))clients.set(settings.projectId,DescopeClient({projectId:settings.projectId}));verify=(jwt,options)=>clients.get(settings.projectId).validateSession(jwt,options);}
  const info=await verify(token,{audience:settings.projectId});
  const claims=info.token;
  if(!claims?.sub||!Number.isFinite(claims.exp)||claims.exp<=Date.now()/1000||!(Array.isArray(claims.aud)?claims.aud:[claims.aud]).includes(settings.projectId))throw new Error('invalid_claims');
  return {id:claims.sub,isAdmin:settings.admins.includes(claims.sub),expiresAt:claims.exp};
 }catch{throw Object.assign(new Error('invalid_session'),{status:401});}
}
export async function sessionUser(req,options){return validateToken(cookieToken(req),options);}
export function setSessionCookie(res,token,expiresAt){const age=Math.max(0,Math.floor(expiresAt-Date.now()/1000));res.setHeader('Set-Cookie',`${sessionCookie}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`);}
export function clearSessionCookie(res){res.setHeader('Set-Cookie',`${sessionCookie}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);}
export async function requireAdmin(req,res){try{const user=await sessionUser(req);if(user.isAdmin)return true;res.status(403).json({error:'수동 수집은 관리자만 실행할 수 있습니다.'});}catch(error){res.status(error.status??401).json({error:error.status===503?'로그인 설정이 필요합니다.':'로그인이 필요합니다.'});}return false;}
