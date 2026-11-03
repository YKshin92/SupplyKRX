// 자동매매 상태 보기·긴급 정지 (관리자 전용). PC의 봇이 비공개 저장소 SupplyKRX-data의 trading-state 가지에 올린
// trading/state.json(현재 잔고·거래내역·매매 성과)을 읽어 보여 주고, 긴급 정지/재개는 trading-control.yml을 실행해
// trading/control.json에 기록한다(봇이 주문 전마다 확인). 사이트는 주문을 내지 않는다.
// 서버 토큰은 수동 수집과 같은 GITHUB_COLLECTION_TOKEN(SupplyKRX-data: Actions 읽기·쓰기 + Contents 읽기).
const repo='https://api.github.com/repos/YKshin92/SupplyKRX-data';
const workflow='trading-control.yml';
const branch='trading-state';
const origin='https://supply-krx.vercel.app';
const ACTIONS=new Set(['stop','resume']);
const active=new Set(['queued','in_progress','waiting','pending','requested']);
async function adminOnly(req,res){
 const {sessionUser}=await import('../server/auth.js');
 try{const user=await sessionUser(req);if(user.isAdmin)return true;res.status(403).json({error:'자동매매 화면은 관리자만 볼 수 있습니다.'});}
 catch(error){res.status(error.status??401).json({error:error.status===503?'로그인 설정이 필요합니다.':error.status===403?'접근 권한이 없는 계정입니다.':'로그인이 필요합니다.'});}
 return false;
}
export function createTradingHandler(authorize=adminOnly,{fetchImpl=fetch,env=process.env}={}){return async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const reply=(code,data)=>res.status(code).json(data);
 if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return reply(405,{error:'지원하지 않는 요청입니다.'});}
 if(req.method==='POST'&&(req.headers.origin!==origin||req.headers['x-trading-request']!=='1'))return reply(403,{error:'사이트의 자동매매 화면에서 사용해 주세요.'});
 if(!await authorize(req,res))return;
 const token=env.GITHUB_COLLECTION_TOKEN;
 if(!token)return reply(503,{error:'자동매매 연결용 서버 인증이 아직 설정되지 않았습니다.'});
 async function github(path,method='GET',body){
  const response=await fetchImpl(repo+path,{method,redirect:'error',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  if(response.status===404&&method==='GET'&&path.startsWith('/contents/'))return null;
  if(!response.ok){const error=new Error('GitHub request failed');error.status=response.status;throw error;}
  return response.status===204?null:response.json();
 }
 const file=async name=>{const meta=await github(`/contents/trading/${name}?ref=${branch}`);if(!meta)return null;if(meta.encoding!=='base64'||typeof meta.content!=='string'||meta.size>4e6)throw Object.assign(new Error('bad file'),{status:502});return JSON.parse(Buffer.from(meta.content,'base64').toString('utf8'));};
 try{
  if(req.method==='GET'){
   const [state,control]=await Promise.all([file('state.json'),file('control.json')]);
   if(state&&state.schema!==1)return reply(502,{error:'봇이 보낸 상태 문서 형식을 읽을 수 없습니다.'});
   return reply(200,{state,control,fetched_at:new Date().toISOString()});
  }
  const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body??{});
  const action=String(body.action??'');
  if(!ACTIONS.has(action))return reply(400,{error:'알 수 없는 요청입니다.'});
  const runs=await github(`/actions/workflows/${workflow}/runs?branch=main&per_page=10`);
  if(runs.workflow_runs.some(r=>active.has(r.status)))return reply(409,{error:'앞선 정지·재개 요청을 기록하는 중입니다. 잠시 후 다시 눌러 주세요.'});
  const requestedAt=new Date().toISOString();
  await github(`/actions/workflows/${workflow}/dispatches`,'POST',{ref:'main',inputs:{action}});
  return reply(202,{requestedAt});
 }catch(error){
  if(error instanceof SyntaxError)return reply(400,{error:'요청 형식이 올바르지 않습니다.'});
  console.error('trading_api_failed',{status:error.status??'network'});
  return reply(502,{error:[401,403].includes(error.status)?'GitHub 인증이 만료됐거나 권한이 부족합니다(서버 토큰에 SupplyKRX-data Contents 읽기 권한 필요).':'GitHub에서 자동매매 상태를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.'});
 }
};}
export default createTradingHandler();
