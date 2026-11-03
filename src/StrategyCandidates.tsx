import {useEffect,useMemo,useRef,useState} from 'react';
import './strategy-candidates.css';
/** 전략 개선 후보: research posts candidates; the owner approves them and requests 반영; the nightly apply task (about 01:47 KST)
 * changes code, data and screens together and records 반영됨. This screen only shows the derived status and sends owner decisions. */
type Status='review'|'approved'|'pending'|'applied'|'failed'|'held'|'withdrawn';
type Action='approve'|'unapprove'|'hold'|'unhold'|'apply';
type Metric={label:string;before:string;after:string};
type Candidate={id:string;created:string;goal:number|null;title:string;source:string|null;label:string|null;summary:string|null;change:string;metrics:Metric[]|null;risks:string[]|null;scope:string[]|null;
 status:Status;status_label:string;approved_at:string|null;held_at?:string|null;requested_at:string|null;applied_at:string|null;note:string|null;app_commit:string|null;release_note:string|null};
type Data={schema_version:number;generated_at:string;candidates:Candidate[]};
type Run={id:number;status:string;conclusion:string|null;url:string};
const LABEL:Record<Status,string>={review:'검토 완료 · 승인 대기',approved:'승인됨',pending:'반영 대기',applied:'반영됨',failed:'반영 실패',held:'보류',withdrawn:'철회'};
/** Status after a recorded decision (shown at once; the saved list follows on the next deploy). */
const AFTER:Record<Exclude<Action,'apply'>,Status>={approve:'approved',unapprove:'review',hold:'held',unhold:'review'};
const GOAL:Record<number,string>={1:'목표 1 · 신호 발굴',2:'목표 2 · 매수·매도 타이밍'};
export const APPLY_TIME='매일 새벽 1시 47분경';
const kst=(iso:string|null)=>{if(!iso)return '';const d=new Date(iso);if(Number.isNaN(d.getTime()))return iso;const k=new Date(d.getTime()+9*3600e3).toISOString();return `${k.slice(0,10)} ${k.slice(11,16)}`;};

export default function StrategyCandidates({canAct,asOf}:{canAct:boolean;asOf:string}){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[reload,setReload]=useState(0);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[runUrl,setRunUrl]=useState('');
 const [local,setLocal]=useState<Record<string,Status>>({});
 const [expanded,setExpanded]=useState<Record<string,boolean>>({});  // cards start folded: title row only
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

 async function send(action:Action,id=''){
  if(busy)return;
  const controller=new AbortController();control.current=controller;
  setBusy(true);setRunUrl('');setMessage('요청을 보내는 중…');
  const pause=()=>new Promise<void>((resolve,reject)=>{const t=setTimeout(resolve,4000);controller.signal.addEventListener('abort',()=>{clearTimeout(t);reject(new DOMException('Aborted','AbortError'));},{once:true});});
  async function call(url:string,body?:object){const r=await fetch(url,{method:body?'POST':'GET',cache:'no-store',credentials:'same-origin',signal:controller.signal,headers:body?{'Content-Type':'application/json','X-Strategy-Request':'1'}:undefined,body:body?JSON.stringify(body):undefined});
   const type=r.headers.get('content-type')??'';if(!type.includes('application/json'))throw new Error('승인 서버에 연결하지 못했습니다.');const d=await r.json();if(!r.ok)throw new Error(d.error??'요청을 처리하지 못했습니다.');return d as {run:Run|null;requestedAt?:string};}
  try{
   const first=await call('/api/strategy',{action,id});const after=first.requestedAt??new Date().toISOString();let run:Run|null=null;const deadline=Date.now()+3*60*1000;
   while(Date.now()<deadline){await pause();const r:{run:Run|null}=run?await call(`/api/strategy?run=${run.id}`):await call(`/api/strategy?after=${encodeURIComponent(after)}`);run=r.run;
    if(run){setRunUrl(run.url);if(run.status==='completed')break;setMessage('요청을 기록하는 중…');}}
   if(!run||run.status!=='completed')throw new Error('기록 확인 시간이 지났습니다. 잠시 뒤 새로 고침해 주세요.');
   if(run.conclusion!=='success')throw new Error('지금 상태에서는 할 수 없는 요청이라 기록되지 않았습니다. 새로 고침 뒤 다시 확인해 주세요.');
   setLocal(v=>{const next={...v};if(action==='apply')for(const c of approved)next[c.id]='pending';else next[id]=AFTER[action];return next;});
   setMessage(action==='apply'?`반영 요청이 기록됐습니다. ${APPLY_TIME} 일괄 적용 작업이 코드·자료·화면을 함께 고치고 검증한 뒤 '반영됨'으로 바꿉니다.`:'기록됐습니다. 이 화면의 상태는 바로 바뀌고, 저장된 목록은 다음 배포(약 10~15분) 뒤 반영됩니다.');
  }catch(e){if(!controller.signal.aborted)setMessage(e instanceof Error?e.message:'요청 실패');}
  finally{if(!controller.signal.aborted)setBusy(false);}
 }

 if(loading)return <div className="chart-empty" role="status">전략 개선 후보를 불러오는 중…</div>;
 if(error)return <div className="no-results" role="alert">{error} <button className="button small" onClick={()=>setReload(v=>v+1)}>다시 불러오기</button></div>;
 const open=rows.filter(c=>c.status!=='applied'&&c.status!=='withdrawn'&&c.status!=='held'),held=rows.filter(c=>c.status==='held'),done=rows.filter(c=>c.status==='applied'||c.status==='withdrawn');
 const STEPS:[Status,string,string][]=[['review','승인 대기','관리자가 검토 후 승인 · 보류'],['approved','승인됨','반영 요청 전 · 취소 가능'],['pending','반영 대기',`${APPLY_TIME} 일괄 적용`],['applied','반영됨','운영 사이트에 적용 완료']];
 const card=(c:Candidate)=>{const isOpen=!!expanded[c.id];return <article key={c.id} className={`sc-card ${c.status}${isOpen?' open':''}`}>
  <div className="sc-card-top">
   <h3 className="sc-heading"><button type="button" className="sc-toggle" aria-expanded={isOpen} aria-controls={`scd-${c.id}`} onClick={()=>setExpanded(v=>({...v,[c.id]:!v[c.id]}))}>
    <span className="sc-chevron" aria-hidden="true"/><span className={`sc-chip ${c.status}`}>{LABEL[c.status]}</span><span className="sc-title">{c.title}</span>
    <span className="sc-when">{c.applied_at?`반영 ${kst(c.applied_at).slice(0,10)}`:c.requested_at?`반영 요청 ${kst(c.requested_at).slice(0,10)}`:c.status==='held'&&c.held_at?`보류 ${kst(c.held_at).slice(0,10)}`:`등록 ${c.created}`}</span>
    <span className="sr-only">{isOpen?' 세부 내용 접기':' 세부 내용 펼치기'}</span>
   </button></h3>
   {canAct&&(c.status==='review'||c.status==='failed'||c.status==='approved'||c.status==='held')&&<div className="sc-card-actions">
    {c.status==='approved'?<button className="button" disabled={busy} onClick={()=>void send('unapprove',c.id)}>승인 취소</button>
     :<button className="button primary" disabled={busy} onClick={()=>void send('approve',c.id)}>{c.status==='failed'?'다시 승인':'승인'}</button>}
    {(c.status==='review'||c.status==='failed')&&<button className="button" disabled={busy} onClick={()=>void send('hold',c.id)}>보류</button>}
    {c.status==='held'&&<button className="button" disabled={busy} onClick={()=>void send('unhold',c.id)}>보류 해제</button>}
   </div>}
  </div>
  {isOpen&&<div className="sc-card-detail" id={`scd-${c.id}`}>
   <div className="sc-tags">{c.goal&&GOAL[c.goal]?<span className="sc-tag">{GOAL[c.goal]}</span>:null}{c.label&&<span className="sc-tag">{c.label}</span>}</div>
   <p className="sc-meta">{c.id} · 등록 {c.created}{c.held_at?` · 보류 ${kst(c.held_at)}`:''}{c.approved_at?` · 승인 ${kst(c.approved_at)}`:''}{c.requested_at?` · 반영 요청 ${kst(c.requested_at)}`:''}</p>
   {c.status==='approved'&&<p className="sc-state approved">승인됨 · 위의 ‘반영 요청’을 누르면 {APPLY_TIME} 적용됩니다. 그 전까지는 사이트 규칙이 바뀌지 않습니다.</p>}
   {c.status==='pending'&&<p className="sc-state pending">{APPLY_TIME} 일괄 적용 예정 · 적용이 끝나면 ‘반영됨’으로 바뀌고 휴대폰 알림이 갑니다.</p>}
   {c.status==='held'&&<p className="sc-state held">보류 중 · 반영 요청에 들어가지 않고, 사이트 규칙도 바뀌지 않습니다. 다시 보려면 ‘보류 해제’(승인 대기로) 또는 바로 ‘승인’을 누르세요.</p>}
   {c.status==='failed'&&<p className="sc-state failed">반영하지 못했습니다{c.note?` · ${c.note}`:''}. 운영 사이트는 바꾸기 전 그대로이며, 다시 승인할 수 있습니다.</p>}
   {c.status==='applied'&&<p className="sc-state applied">반영됨 {kst(c.applied_at)}{c.app_commit?` · 앱 ${c.app_commit.slice(0,7)}`:''}{c.note?` · ${c.note}`:''}</p>}
   <div className="sc-card-body">
    <div className="sc-main">
     {c.summary&&<p>{c.summary}</p>}
     <div className="sc-change"><b>바꾸는 내용</b><p>{c.change}</p></div>
     {!!c.risks?.length&&<div className="sc-risks"><b>주의할 점</b><ul>{c.risks.map(r=><li key={r}>{r}</li>)}</ul></div>}
     {!!c.scope?.length&&<details className="sc-scope"><summary>반영하면 바뀌는 곳 {c.scope.length}가지</summary><ul>{c.scope.map(x=><li key={x}>{x}</li>)}</ul></details>}
    </div>
    {!!c.metrics?.length&&<div className="sc-side"><h4>숫자 비교 <small>과거 8년 · 1억 기준</small></h4>
     <table className="sc-metrics"><thead><tr><th scope="col">항목</th><th scope="col">지금</th><th scope="col">바꾸면</th></tr></thead>
      <tbody>{c.metrics.map(m=><tr key={m.label}><th scope="row">{m.label}</th><td data-label="지금">{m.before}</td><td data-label="바꾸면">{m.after}</td></tr>)}</tbody></table></div>}
   </div>
   {c.source&&<p className="sc-source">근거 · {c.source}</p>}
  </div>}
 </article>;};
 return <div className="strategy-candidates">
  <div className="sc-head"><div><div className="eyebrow">IMPROVEMENT PIPELINE</div><h2>전략 개선 후보</h2><p>일일 개선 연구가 검토를 통과했다고 판단한 매매법 개선안입니다. 승인한 후보를 모아 반영을 요청하면 {APPLY_TIME} 일괄 적용 작업이 신호 계산·16시 알림·화면·과거 8년 검증까지 함께 바꾸고 검증한 뒤 운영에 반영합니다.</p></div>
   <button className="button small" onClick={()=>setReload(v=>v+1)}>새로 고침</button></div>
  <ol className="sc-steps" aria-label="진행 단계와 후보 수">{STEPS.map(([s,label,hint])=><li key={s} className={`${s}${count(s)?' has':''}`}><span className="sc-step-count">{count(s)}</span><span className="sc-step-text"><b>{label}</b><small>{hint}</small></span></li>)}</ol>
  {count('failed')>0&&<p className="sc-state failed">반영 실패 {count('failed')}건 · 아래 카드에서 이유를 확인하고 다시 승인할 수 있습니다.</p>}
  {canAct?<div className="sc-actionbar"><div><b>반영 요청</b><span>{approved.length?`승인한 ${approved.length}건을 ${APPLY_TIME} 함께 적용합니다. 요청 전까지는 사이트 규칙이 바뀌지 않습니다.`:open.some(c=>c.status==='review'||c.status==='failed')?'아래 후보에서 ‘승인’을 누르면 여기서 한꺼번에 반영을 요청할 수 있습니다. 미룰 후보는 ‘보류’로 옮겨 둘 수 있습니다.':'지금 요청할 후보가 없습니다.'}</span></div>
    <button className="button primary" disabled={busy||!approved.length} onClick={()=>void send('apply')}>승인된 {approved.length}건 반영 요청</button></div>
   :<p className="sc-note">승인·반영 요청은 관리자만 할 수 있습니다. 목록은 누구나 볼 수 있습니다.</p>}
  {message&&<p className="sc-message" role="status">{message}{runUrl&&<> <a href={runUrl} target="_blank" rel="noopener noreferrer">실행 내역</a></>}</p>}
  {!rows.length&&<div className="no-results">아직 올라온 후보가 없습니다. 일일 개선 연구가 기준을 통과한 개선안을 찾으면 여기에 올립니다.</div>}
  {!!rows.length&&<div className="sc-list-head"><span>검토할 후보 {open.length}건{held.length?` · 보류 ${held.length}건`:''}{done.length?` · 반영된 후보 ${done.length}건`:''} · 제목을 누르면 세부 내용이 펼쳐집니다</span>
   <button type="button" className="text-button" onClick={()=>setExpanded(rows.every(c=>expanded[c.id])?{}:Object.fromEntries(rows.map(c=>[c.id,true])))}>{rows.every(c=>expanded[c.id])?'모두 접기':'모두 펼치기'}</button></div>}
  {!!open.length&&<div className="sc-list">{open.map(card)}</div>}
  {!!rows.length&&!open.length&&<p className="sc-note">지금 검토할 후보가 없습니다.{held.length?' 보류한 후보는 아래에 있습니다.':''}</p>}
  {!!held.length&&<details className="sc-done sc-held"><summary>보류한 후보 {held.length}건 <small>반영 요청에 들어가지 않음</small></summary><div className="sc-list">{held.map(card)}</div></details>}
  {!!done.length&&<details className="sc-done"><summary>반영된 후보 {done.length}건</summary><div className="sc-list">{done.map(card)}</div></details>}
 </div>;
}
