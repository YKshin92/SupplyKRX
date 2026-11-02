// 전략 개선 후보 승인·반영 요청 (관리자 전용). The site never edits files itself: it dispatches the private
// strategy-decision.yml workflow, which validates the decision against the current status and records it in data/strategy/decisions.json.
// Same server secret and admin list as /api/collect (GITHUB_COLLECTION_TOKEN: Actions read/write on SupplyKRX-data only).
const base='https://api.github.com/repos/YKshin92/SupplyKRX-data/actions';
const workflow='strategy-decision.yml';
const origin='https://supply-krx.vercel.app';
const ID=/^c\d{3}(?:-[a-z0-9]+){0,6}$/;
const ACTIONS=new Set(['approve','unapprove','apply']);
const active=new Set(['queued','in_progress','waiting','pending','requested']);
async function adminOnly(req,res){
 const {sessionUser}=await import('../server/auth.js');
 try{const user=await sessionUser(req);if(user.isAdmin)return true;res.status(403).json({error:'승인·반영은 관리자만 할 수 있습니다.'});}
 catch(error){res.status(error.status??401).json({error:error.status===503?'로그인 설정이 필요합니다.':'로그인이 필요합니다.'});}
 return false;
}
export function createStrategyHandler(authorize=adminOnly,{fetchImpl=fetch,env=process.env}={}){return async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const reply=(code,data)=>res.status(code).json(data);
 if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return reply(405,{error:'지원하지 않는 요청입니다.'});}
 if(req.method==='POST'&&(req.headers.origin!==origin||req.headers['x-strategy-request']!=='1'))return reply(403,{error:'사이트의 전략 개선 후보 화면에서 사용해 주세요.'});
 if(!await authorize(req,res))return;
 const token=env.GITHUB_COLLECTION_TOKEN;
 if(!token)return reply(503,{error:'승인·반영용 서버 인증이 아직 설정되지 않았습니다.'});
 async function github(path,method='GET',body){
  const response=await fetchImpl(base+path,{method,redirect:'error',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  if(!response.ok){const error=new Error('GitHub request failed');error.status=response.status;throw error;}
  return response.status===204?null:response.json();
 }
 const safe=run=>({id:run.id,status:run.status,conclusion:run.conclusion,url:`https://github.com/YKshin92/SupplyKRX-data/actions/runs/${run.id}`});
 try{
  if(req.method==='GET'&&req.query?.run){
   if(!/^\d{1,20}$/.test(String(req.query.run)))return reply(400,{error:'잘못된 실행 번호입니다.'});
   const run=await github(`/runs/${req.query.run}`);
   if(run.path!==`.github/workflows/${workflow}`)return reply(404,{error:'승인 기록 실행을 찾을 수 없습니다.'});
   return reply(200,{run:safe(run)});
  }
  const result=await github(`/workflows/${workflow}/runs?branch=main&per_page=20`);
  if(req.method==='GET'){
   const after=Date.parse(String(req.query?.after??''));
   if(!Number.isFinite(after))return reply(400,{error:'요청 시간이 필요합니다.'});
   const run=result.workflow_runs.find(r=>r.event==='workflow_dispatch'&&Date.parse(r.created_at)>=after-1000);
   return reply(200,{run:run?safe(run):null});
  }
  const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body??{});
  const action=String(body.action??''),id=String(body.id??'');
  if(!ACTIONS.has(action))return reply(400,{error:'알 수 없는 요청입니다.'});
  if(action==='apply'?id!=='':!ID.test(id))return reply(400,{error:'후보 번호가 올바르지 않습니다.'});
  if(result.workflow_runs.some(r=>active.has(r.status)))return reply(409,{error:'앞선 승인·반영 요청을 기록하는 중입니다. 잠시 후 다시 눌러 주세요.'});
  const requestedAt=new Date().toISOString();
  await github(`/workflows/${workflow}/dispatches`,'POST',{ref:'main',inputs:{action,id}});
  return reply(202,{run:null,requestedAt});
 }catch(error){
  if(error instanceof SyntaxError)return reply(400,{error:'요청 형식이 올바르지 않습니다.'});
  console.error('strategy_api_failed',{status:error.status??'network'});
  return reply(502,{error:[401,403].includes(error.status)?'GitHub 인증이 만료됐거나 권한이 부족합니다.':'요청을 GitHub에 전달하지 못했습니다. 잠시 후 다시 시도해 주세요.'});
 }
};}
export default createStrategyHandler();
