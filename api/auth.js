import {config,sameOrigin,validateToken,sessionUser,setSessionCookie,clearSessionCookie} from '../server/auth.js';
export function createAuthHandler(options={}){return async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 const action=req.query?.action??'me';
 const method=action==='session'||action==='logout'?'POST':'GET';
 if(req.method!==method){res.setHeader('Allow',method);return res.status(405).json({error:'지원하지 않는 요청입니다.'});}
 if(method==='POST'&&!sameOrigin(req,options.env))return res.status(403).json({error:'사이트에서 로그인해 주세요.'});
 if(action==='config'){const settings=config(options.env);return res.status(settings.projectId?200:503).json(settings.projectId?{projectId:settings.projectId}:{error:'이메일 로그인 연결을 준비 중입니다.'});}
 if(action==='logout'){clearSessionCookie(res);return res.status(200).json({ok:true});}
 try{
  if(action==='session'){const token=req.body?.sessionToken;const user=await validateToken(token,options);setSessionCookie(res,token,user.expiresAt);return res.status(200).json(user);}
  if(action==='me')return res.status(200).json(await sessionUser(req,options));
  return res.status(404).json({error:'없는 요청입니다.'});
 }catch(error){return res.status(error.status??401).json({error:error.status===503?'로그인 설정이 필요합니다.':'로그인이 만료됐습니다. 다시 인증해 주세요.'});}
};}
export default createAuthHandler();
