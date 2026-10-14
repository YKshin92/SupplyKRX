import {requireAdmin} from '../server/auth.js';
const base='https://api.github.com/repos/YKshin92/SupplyKRX-data/actions';
const workflow='collect.yml';
const active=new Set(['queued','in_progress','waiting','pending','requested']);
const origin='https://supply-krx.vercel.app';
export function createCollectHandler(authorize=requireAdmin){return async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  const reply=(code,data)=>res.status(code).json(data);
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return reply(405,{error:'지원하지 않는 요청입니다.'});}
  if(req.method==='POST'&&(req.headers.origin!==origin||req.headers['x-collection-request']!=='1'))return reply(403,{error:'사이트에서 수집 버튼을 사용해 주세요.'});
  if(!await authorize(req,res))return;
  const token=process.env.GITHUB_COLLECTION_TOKEN;
  if(!token)return reply(503,{error:'수동 수집용 서버 인증이 아직 설정되지 않았습니다.'});
  async function github(path,method='GET',body) {
    const response=await fetch(base+path,{method,redirect:'error',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});
    if(!response.ok){const error=new Error('GitHub request failed');error.status=response.status;throw error;}
    return response.status===204?null:response.json();
  }
  function safe(run){return {id:run.id,status:run.status,conclusion:run.conclusion,url:`https://github.com/YKshin92/SupplyKRX-data/actions/runs/${run.id}`};}
  try {
    if(req.method==='GET'&&req.query?.run){
      if(!/^\d{1,20}$/.test(String(req.query.run)))return reply(400,{error:'잘못된 실행 번호입니다.'});
      const run=await github(`/runs/${req.query.run}`);
      if(run.path!=='.github/workflows/collect.yml')return reply(404,{error:'수집 실행을 찾을 수 없습니다.'});
      return reply(200,{run:safe(run)});
    }
    const result=await github(`/workflows/${workflow}/runs?branch=main&per_page=30`);
    if(req.method==='GET'){
      const after=Date.parse(String(req.query?.after??''));
      if(!Number.isFinite(after))return reply(400,{error:'수집 요청 시간이 필요합니다.'});
      const run=result.workflow_runs.find(r=>r.event==='workflow_dispatch'&&Date.parse(r.created_at)>=after-1000);
      return reply(200,{run:run?safe(run):null});
    }
    const existing=result.workflow_runs.find(r=>active.has(r.status)||Date.now()-Date.parse(r.created_at)<60000);
    if(existing)return reply(200,{run:safe(existing),reused:true});
    const requestedAt=new Date().toISOString();
    await github(`/workflows/${workflow}/dispatches`,'POST',{ref:'main'});
    return reply(202,{run:null,requestedAt});
  }catch(error){
    console.error('collection_api_failed',{status:error.status??'network'});
    return reply(502,{error:[401,403].includes(error.status)?'GitHub 수집 인증이 만료됐거나 권한이 부족합니다.':'GitHub 수집 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'});
  }
};}
export default createCollectHandler();
