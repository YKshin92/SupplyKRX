import {next} from '@vercel/functions';
import {sessionUser} from './server/auth.js';

export function createProxy(validate=sessionUser){return async function proxy(request){
 const path=new URL(request.url).pathname;
 // The login screen, assets and auth endpoints contain no market data.
 if(path==='/api/auth')return next();
 if(!path.startsWith('/data/')&&!path.startsWith('/api/'))return next();
 if(/\.(csv|tsv|zip)$/i.test(path))return Response.json({error:'다운로드는 제공하지 않습니다.'},{status:403,headers:{'Cache-Control':'private, no-store'}});
 try{const user=await validate(request);if(path==='/api/collect'&&!user.isAdmin)return Response.json({error:'관리자만 수집할 수 있습니다.'},{status:403,headers:{'Cache-Control':'private, no-store'}});return next({headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});}
 catch(error){return Response.json({error:error.status===503?'로그인 연결을 준비 중입니다.':'로그인이 필요합니다.'},{status:error.status??401,headers:{'Cache-Control':'private, no-store'}});}
};}
export default createProxy();
