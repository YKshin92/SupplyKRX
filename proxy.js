import {next} from '@vercel/functions';
import {sessionUser} from './server/auth.js';

// Guest accounts see 시장 현황 · 종목 발굴 · 신규 순매수 추적 · 전략 검증 only; the data behind the admin tabs is refused here too.
const ADMIN_DATA=['/data/live/signal-lab','/data/live/strategy-candidates.json'];
export function createProxy(validate=sessionUser){return async function proxy(request){
 // Decode and collapse repeated slashes first so encoded or doubled paths cannot skip the checks below.
 let path;try{path=decodeURIComponent(new URL(request.url).pathname).replace(/\/{2,}/g,'/');}catch{return Response.json({error:'잘못된 주소입니다.'},{status:400,headers:{'Cache-Control':'private, no-store'}});}
 // The login screen, assets and auth endpoints contain no market data.
 if(path==='/api/auth')return next();
 if(!path.startsWith('/data/')&&!path.startsWith('/api/'))return next();
 if(/\.(csv|tsv|zip)$/i.test(path))return Response.json({error:'다운로드는 제공하지 않습니다.'},{status:403,headers:{'Cache-Control':'private, no-store'}});
 try{const user=await validate(request);if(path==='/api/collect'&&!user.isAdmin)return Response.json({error:'관리자만 수집할 수 있습니다.'},{status:403,headers:{'Cache-Control':'private, no-store'}});if(path==='/api/strategy'&&!user.isAdmin)return Response.json({error:'관리자만 승인·반영할 수 있습니다.'},{status:403,headers:{'Cache-Control':'private, no-store'}});if(!user.isAdmin&&ADMIN_DATA.some(p=>path===p||path.startsWith(p+'/')))return Response.json({error:'관리자만 볼 수 있는 자료입니다.'},{status:403,headers:{'Cache-Control':'private, no-store'}});if(path==='/api/trading'&&!user.isAdmin)return Response.json({error:'자동매매 화면은 관리자만 볼 수 있습니다.'},{status:403,headers:{'Cache-Control':'private, no-store'}});return next({headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});}
 catch(error){return Response.json({error:error.status===503?'로그인 연결을 준비 중입니다.':error.status===403?'접근 권한이 없는 계정입니다.':'로그인이 필요합니다.'},{status:error.status??401,headers:{'Cache-Control':'private, no-store'}});}
};}
export default createProxy();
