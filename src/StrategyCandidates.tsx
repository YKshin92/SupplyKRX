import {useEffect,useMemo,useRef,useState} from 'react';
import './strategy-candidates.css';
/** 전략 개선 후보: research posts candidates; the owner approves them and requests 반영; the nightly apply task (about 01:47 KST)
 * changes code, data and screens together and records 반영됨. This screen only shows the derived status and sends owner decisions. */
type Status='review'|'approved'|'pending'|'applied'|'failed'|'withdrawn';
type Metric={label:string;before:string;after:string};
type Candidate={id:string;created:string;goal:number|null;title:string;source:string|null;label:string|null;summary:string|null;change:string;metrics:Metric[]|null;risks:string[]|null;scope:string[]|null;
 status:Status;status_label:string;approved_at:string|null;requested_at:string|null;applied_at:string|null;note:string|null;app_commit:string|null;release_note:string|null};
type Data={schema_version:number;generated_at:string;candidates:Candidate[]};
type Run={id:number;status:string;conclusion:string|null;url:string};
const LABEL:Record<Status,string>={review:'검토 완료 · 승인 대기',approved:'승인됨',pending:'반영 대기',applied:'반영됨',failed:'반영 실패',withdrawn:'철회'};
const GOAL:Record<number,string>={1:'목표 1 · 신호 발굴',2:'목표 2 · 매수·매도 타이밍'};
export const APPLY_TIME='매일 새벽 1시 47분경';
const kst=(iso:string|null)=>{if(!iso)return '';const d=new Date(iso);if(Number.isNaN(d.getTime()))return iso;const k=new Date(d.getTime()+9*3600e3).toISOString();return `${k.slice(0,10)} ${k.slice(11,16)}`;};

export default function StrategyCandidates({canAct,asOf}:{canAct:boolean;asOf:string}){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[reload,setReload]=useState(0);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[runUrl,setRunUrl]=useState('');
 const [local,setLocal]=useState<Record<string,Status>>({});
 const control=useRef<AbortController|null>(null);
 useEffect(()=>()=>control.current?.abort(),[]);
 useEffect(()=>{let cancelled=false;setLoading(true);setError('');
  fetch(`/data/live/strategy-candidates.json?v=${encodeURIComponent(asOf)}&r=${reload}`,{cache:'no-store',credentials:'same-origin'})
   .then(async r=>{if(r.status===404)return {schema_version:1,generated_at:'',candidates:[]} as Data;if(!r.ok)throw new Error(r.status===401?'로그인 후 다시 시도해 주세요.':'후보 목록을 불러오지 못했습니다.');const d=await r.json() as Data;if(d.schema_version!==1||!Array.isArray(d.candidates))throw new Error('지원하지 않는 후보 자료 형식입니다.');return d;})
   .then(d=>{if(!cancelled){setData(d);setLocal({});}}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:String(e));}).finally(()=>{if(!cancelled)setLoading(false);});
  return()=>{cancelled=true;};},[asOf,reload]);
 const rows=useMemo(()=>(data?.candidates??[]).map(c=>({...c,status:local[c.id]??c.status})),[data,local]);
 const count=(s:Status)=>rows.filter(c=>c.status===s).length;
 const approved=rows.filter(c=>c.status==='approved');

 async function send(action:'approve'|'unapprove'|'apply',id=''){
  if(busy)return;
  const controller=new AbortController();control.current=controller;
  setBusy(true);setRunUrl('');setMessage('요청을 보내는 중…');
  const pause=()=>new Promise<void>((resolve,reject)=>{const t=setTimeout(resolve,4000);controller.signal.addEventListener('abort',()=>{clearTimeout(t);reject(new DOMException('Aborted','AbortError'));},{once:true});});
  async function call(url:string,body?:object){const r=await fetch(url,{method:body?'POST':'GET',cache:'no-store',credentials:'same-origin',signal:controller.signal,headers:body?{'Content-Type':'application/json','X-Strategy-Request':'1'}:undefined,body:body?JSON.stringify(body):undefined});
   const type=r.headers.get('content-type')??'';if(!type.includes('application/json'))throw new Error('승인 서버에 연결하지 못했습니다.');const d=await r.json();if(!r.ok)throw new Error(d.error??'요청을 처리하지 못했습니다.');return d as {run:Run|null;requestedAt?:string};}
  try{
   const first=await call('/api/strategy',{action,id});const after=first.requestedAt??new Date().toISOString();let run:Run|null=null;const deadline=Date.now()+3*60*1000;
   while(Date.now()<deadline){await pause();const r=run?await call(`/api/strategy?run=${run.id}`):await call(`/api/strategy?after=${encodeURIComponent(after)}`);run=r.run;
    if(run){setRunUrl(run.url);if(run.status==='completed')break;setMessage('요청을 기록하는 중…');}}
   if(!run||run.status!=='completed')throw new Error('기록 확인 시간이 지났습니다. 잠시 뒤 새로 고침해 주세요.');
   if(run.conclusion!=='success')throw new Error('지금 상태에서는 할 수 없는 요청이라 기록되지 않았습니다. 새로 고침 뒤 다시 확인해 주세요.');
   setLocal(v=>{const next={...v};if(action==='apply')for(const c of approved)next[c.id]='pending';else next[id]=action==='approve'?'approved':'review';return next;});
   setMessage(action==='apply'?`반영 요청이 기록됐습니다. ${APPLY_TIME} 일괄 적용 작업이 코드·자료·화면을 함께 고치고 검증한 뒤 '반영됨'으로 바꿉니다.`:'기록됐습니다. 이 화면의 상태는 바로 바뀌고, 저장된 목록은 다음 배포(약 10~15분) 뒤 반영됩니다.');
  }catch(e){if(!controller.signal.aborted)setMessage(e instanceof Error?e.message:'요청 실패');}
  finally{if(!controller.signal.aborted)setBusy(false);}
 }

 if(loading)return <div className="chart-empty" role="status">전략 개선 후보를 불러오는 중…</div>;
 if(error)return <div className="no-results" role="alert">{error} <button className="button small" onClick={()=>setReload(v=>v+1)}>다시 불러오기</button></div>;
 return <div className="strategy-candidates">
  <div className="sc-head"><div><h2>전략 개선 후보</h2><p>일일 개선 연구에서 검토가 괜찮다고 판단한 매매법 개선안입니다. 승인한 항목을 모아 반영을 요청하면 {APPLY_TIME} 일괄 적용 작업이 신호 계산·알림·화면·과거 8년 검증까지 함께 바꾸고 검증한 뒤 운영에 반영합니다.</p></div>
   <button className="button small" onClick={()=>setReload(v=>v+1)}>새로 고침</button></div>
  <ol className="sc-flow" aria-label="반영 순서"><li>연구가 후보 등록</li><li>승인</li><li>반영 요청</li><li>{APPLY_TIME} 일괄 적용·검증</li><li>반영됨</li></ol>
  <div className="sc-counts" aria-label="상태별 후보 수">{(['review','approved','pending','applied','failed'] as Status[]).map(s=><span key={s} className={`sc-chip ${s}`}>{LABEL[s]} <b>{count(s)}</b></span>)}</div>
  {canAct?<div className="sc-apply"><button className="button primary" disabled={busy||!approved.length} onClick={()=>void send('apply')}>승인된 {approved.length}건 반영 요청</button><span>{approved.length?`요청하면 ${APPLY_TIME} 함께 적용됩니다. 그 전까지는 사이트 규칙이 바뀌지 않습니다.`:'승인한 후보가 없습니다.'}</span></div>
   :<p className="sc-note">승인·반영 요청은 관리자만 할 수 있습니다.</p>}
  {message&&<p className="sc-message" role="status">{message}{runUrl&&<> <a href={runUrl} target="_blank" rel="noopener noreferrer">실행 내역</a></>}</p>}
  {!rows.length&&<div className="no-results">아직 올라온 후보가 없습니다. 일일 개선 연구가 기준을 통과한 개선안을 찾으면 여기에 올립니다.</div>}
  <div className="sc-list">{rows.map(c=><article key={c.id} className={`sc-card ${c.status}`} aria-labelledby={`sc-${c.id}`}>
   <header><span className={`sc-chip ${c.status}`}>{LABEL[c.status]}</span><h3 id={`sc-${c.id}`}>{c.title}</h3>
    <p className="sc-meta">{c.id} · 등록 {c.created}{c.goal&&GOAL[c.goal]?` · ${GOAL[c.goal]}`:''}{c.label?` · ${c.label}`:''}</p></header>
   {c.summary&&<p>{c.summary}</p>}
   <div className="sc-change"><b>바꾸는 내용</b><p>{c.change}</p></div>
   {!!c.metrics?.length&&<div className="sc-table-scroll"><table className="sc-metrics"><thead><tr><th scope="col">항목</th><th scope="col">지금</th><th scope="col">바꾸면</th></tr></thead>
    <tbody>{c.metrics.map(m=><tr key={m.label}><th scope="row">{m.label}</th><td>{m.before}</td><td>{m.after}</td></tr>)}</tbody></table></div>}
   {!!c.risks?.length&&<div className="sc-risks"><b>주의할 점</b><ul>{c.risks.map(r=><li key={r}>{r}</li>)}</ul></div>}
   {!!c.scope?.length&&<details className="sc-scope"><summary>반영하면 바뀌는 곳</summary><ul>{c.scope.map(s=><li key={s}>{s}</li>)}</ul></details>}
   <footer>
    <p className="sc-meta">{c.source?`근거: ${c.source}`:''}{c.approved_at?` · 승인 ${kst(c.approved_at)}`:''}{c.requested_at?` · 반영 요청 ${kst(c.requested_at)}`:''}{c.applied_at?` · 반영됨 ${kst(c.applied_at)}`:''}{c.app_commit?` · 앱 ${c.app_commit.slice(0,7)}`:''}</p>
    {c.note&&<p className={c.status==='failed'?'sc-failed':'sc-meta'}>{c.status==='failed'?'반영하지 못한 이유: ':''}{c.note}</p>}
    {canAct&&(c.status==='review'||c.status==='failed')&&<button className="button small" disabled={busy} onClick={()=>void send('approve',c.id)}>{c.status==='failed'?'다시 승인':'승인'}</button>}
    {canAct&&c.status==='approved'&&<button className="button small" disabled={busy} onClick={()=>void send('unapprove',c.id)}>승인 취소</button>}
   </footer>
  </article>)}</div>
 </div>;
}
