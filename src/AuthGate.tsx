import {AuthProvider,useDescope,useSession} from '@descope/react-sdk';
import {lazy,Suspense,useEffect,useState,type FormEvent} from 'react';
import {Eye,EyeOff,LogIn,LogOut,ShieldCheck} from 'lucide-react';
const App=lazy(()=>import('./App'));
import './auth.css';

type Member={id:string;isAdmin:boolean;expiresAt:number};
async function authRequest(action:string,body?:object,signal?:AbortSignal){const response=await fetch(`/api/auth?action=${action}`,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,cache:'no-store',signal});const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error??'로그인 요청을 처리하지 못했습니다.'),{status:response.status});return data;}
// Descope's console only takes an email or phone as a login ID, so accounts are created as <id>@supply-krx.vercel.app (a domain with no
// mailbox; invitations off) and people type just the short ID here, e.g. master or guest.
const LOGIN_DOMAIN='supply-krx.vercel.app';
export const toLoginId=(id:string)=>{const v=id.trim();return v.includes('@')?v:`${v.toLowerCase()}@${LOGIN_DOMAIN}`;};
// Accounts are issued by the administrator (Descope console); there is no sign-up here, and the server refuses users without an issued role.
function LoginFrame({children}:{children:React.ReactNode}){return <main className="auth-page"><section className="auth-card"><div className="eyebrow">PENSION FLOW</div><h1>연기금 수급 연구소</h1><p className="auth-intro">관리자가 발급한 아이디로 로그인하세요.</p>{children}<footer><ShieldCheck size={15}/> 계정이 필요하면 관리자에게 문의해 주세요.</footer></section></main>;}
function SessionGate(){
 const sdk=useDescope();const {isAuthenticated,isSessionLoading,sessionToken}=useSession();
 const [member,setMember]=useState<Member|null>(null),[checking,setChecking]=useState(false),[error,setError]=useState('');
 const [loginId,setLoginId]=useState(''),[password,setPassword]=useState(''),[show,setShow]=useState(false),[busy,setBusy]=useState(false);
 // 비밀번호 바꾸기: an issued (temporary) password is replaced with the person's own one (Descope password.replace; no sign-in needed).
 const [change,setChange]=useState(false),[next,setNext]=useState(''),[confirm,setConfirm]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{if(!isAuthenticated||!sessionToken){setMember(null);return;}const controller=new AbortController();setChecking(true);authRequest('session',{sessionToken},controller.signal).then(setMember).catch(e=>{if(e.name==='AbortError')return;setMember(null);setError(e.message);if(e.status===403)void sdk.logout();}).finally(()=>{if(!controller.signal.aborted)setChecking(false);});return()=>controller.abort();},[isAuthenticated,sessionToken]);
 // Stay signed in until 로그아웃: renew the short session about a minute before it ends (and when the tab comes back after sleep)
 // with the stored refresh token. The new session token is exchanged for a new HttpOnly cookie by the effect above. Only a failed
 // renewal (refresh token expired or revoked in Descope) returns to the login screen. How long that lasts is Descope's Refresh Token Timeout.
 useEffect(()=>{if(!member)return;let done=false;
  const renew=async()=>{if(done)return;done=true;try{const response=await sdk.refresh();if(!response?.ok)throw new Error();}catch{setMember(null);setError('로그인이 만료됐습니다. 다시 로그인해 주세요.');}};
  const timer=setTimeout(()=>void renew(),Math.max(0,member.expiresAt*1000-Date.now()-60_000));
  const wake=()=>{if(document.visibilityState==='visible'&&member.expiresAt*1000-Date.now()<90_000)void renew();};
  document.addEventListener('visibilitychange',wake);window.addEventListener('focus',wake);
  return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',wake);window.removeEventListener('focus',wake);};},[member]);
 async function logout(){setBusy(true);try{await authRequest('logout',{});setMember(null);await sdk.logout();setPassword('');setError('');}catch{setError('로그아웃을 완료하지 못했습니다. 다시 시도해 주세요.');}finally{setBusy(false);}}
 async function signIn(event:FormEvent){event.preventDefault();if(busy)return;setBusy(true);setError('');try{const response=await sdk.password.signIn(toLoginId(loginId),password);if(!response.ok)throw new Error();setPassword('');}catch{setError('아이디 또는 비밀번호가 올바르지 않습니다. 관리자에게 받은 임시 비밀번호라면 아래 ‘비밀번호 바꾸기’로 먼저 바꿔 주세요. 여러 번 틀리면 잠시 잠길 수 있습니다.');}finally{setBusy(false);}}
 async function replacePassword(event:FormEvent){event.preventDefault();if(busy)return;if(next!==confirm){setError('새 비밀번호가 서로 다릅니다.');return;}setBusy(true);setError('');setNotice('');
  try{const response=await sdk.password.replace(toLoginId(loginId),password,next);if(!response.ok)throw new Error(response.error?.errorDescription??'');setPassword('');setNext('');setConfirm('');setChange(false);setNotice('비밀번호를 바꿨습니다. 새 비밀번호로 로그인하세요.');}
  catch(e){const why=(e as Error).message;setError(`비밀번호를 바꾸지 못했습니다.${why?` (${why})`:''} 아이디·지금 비밀번호를 확인하고, 새 비밀번호가 규칙(최소 길이 등)에 맞는지 확인해 주세요.`);}finally{setBusy(false);}}
 if(member&&isAuthenticated)return <Suspense fallback={<LoginFrame><p role="status">대시보드를 불러오고 있습니다.</p></LoginFrame>}><App canCollect={member.isAdmin} accountControls={<button className="button" disabled={busy} onClick={()=>void logout()}><LogOut size={16}/> 로그아웃</button>}/></Suspense>;
 return <LoginFrame>{isSessionLoading||checking?<p role="status">로그인을 확인하고 있습니다.</p>:change?<><form onSubmit={replacePassword}>
  <label htmlFor="cp-id">아이디</label><input id="cp-id" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={64} value={loginId} onChange={e=>setLoginId(e.target.value)}/>
  <label htmlFor="cp-old">지금 비밀번호 (받은 임시 비밀번호)</label><input id="cp-old" type={show?'text':'password'} autoComplete="current-password" required maxLength={64} value={password} onChange={e=>setPassword(e.target.value)}/>
  <label htmlFor="cp-new">새 비밀번호</label><input id="cp-new" type={show?'text':'password'} autoComplete="new-password" required maxLength={64} value={next} onChange={e=>setNext(e.target.value)}/>
  <label htmlFor="cp-new2">새 비밀번호 확인</label><input id="cp-new2" type={show?'text':'password'} autoComplete="new-password" required maxLength={64} value={confirm} onChange={e=>setConfirm(e.target.value)}/>
  <label className="auth-check"><input type="checkbox" checked={show} onChange={e=>setShow(e.target.checked)}/> 비밀번호 보이기</label>
  <button className="button primary" disabled={busy}>{busy?'바꾸는 중…':'비밀번호 바꾸기'}</button>
 </form><div className="auth-secondary"><button className="button" disabled={busy} onClick={()=>{setChange(false);setError('');}}>로그인으로 돌아가기</button></div></>:<><form onSubmit={signIn}>
  <label htmlFor="auth-id">아이디</label><input id="auth-id" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={64} value={loginId} onChange={e=>setLoginId(e.target.value)}/>
  <label htmlFor="auth-password">비밀번호</label><div className="auth-password"><input id="auth-password" name="password" type={show?'text':'password'} autoComplete="current-password" required maxLength={64} value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" className="auth-reveal" aria-label={show?'비밀번호 숨기기':'비밀번호 보기'} aria-pressed={show} onClick={()=>setShow(v=>!v)}>{show?<EyeOff size={17}/>:<Eye size={17}/>}</button></div>
  <button className="button primary" disabled={busy}><LogIn size={17}/>{busy?'확인 중…':'로그인'}</button>
 </form><div className="auth-secondary"><button type="button" className="text-button auth-mail-link" onClick={()=>{setChange(true);setError('');setNotice('');}}>비밀번호 바꾸기</button>{isAuthenticated&&!member&&<button className="button" disabled={busy} onClick={()=>void logout()}>로그인 다시 하기</button>}</div></>}{notice&&<p className="auth-notice" role="status">{notice}</p>}{error&&<p className="auth-error" role="alert">{error}</p>}</LoginFrame>;
}
export default function AuthGate(){const [projectId,setProjectId]=useState(''),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);useEffect(()=>{const controller=new AbortController();setError('');authRequest('config',undefined,controller.signal).then(data=>setProjectId(data.projectId)).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();},[attempt]);return projectId?<AuthProvider projectId={projectId} persistTokens autoRefresh><SessionGate/></AuthProvider>:<LoginFrame><p role="status">{error||'로그인 연결을 확인하고 있습니다.'}</p>{error&&<button className="button" onClick={()=>setAttempt(v=>v+1)}>다시 확인</button>}</LoginFrame>;}
