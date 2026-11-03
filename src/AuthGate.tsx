import {AuthProvider,useDescope,useSession} from '@descope/react-sdk';
import {lazy,Suspense,useEffect,useState,type FormEvent} from 'react';
import {Eye,EyeOff,LogIn,LogOut,ShieldCheck} from 'lucide-react';
const App=lazy(()=>import('./App'));
import './auth.css';

type Member={id:string;isAdmin:boolean;expiresAt:number};
async function authRequest(action:string,body?:object,signal?:AbortSignal){const response=await fetch(`/api/auth?action=${action}`,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,cache:'no-store',signal});const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error??'로그인 요청을 처리하지 못했습니다.'),{status:response.status});return data;}
// Accounts are issued by the administrator (Descope console); there is no sign-up here, and the server refuses users without an issued role.
function LoginFrame({children}:{children:React.ReactNode}){return <main className="auth-page"><section className="auth-card"><div className="eyebrow">PENSION FLOW</div><h1>연기금 수급 연구소</h1><p className="auth-intro">관리자가 발급한 아이디로 로그인하세요.</p>{children}<footer><ShieldCheck size={15}/> 계정이 필요하면 관리자에게 문의해 주세요.</footer></section></main>;}
function SessionGate(){
 const sdk=useDescope();const {isAuthenticated,isSessionLoading,sessionToken}=useSession();
 const [member,setMember]=useState<Member|null>(null),[checking,setChecking]=useState(false),[error,setError]=useState('');
 const [loginId,setLoginId]=useState(''),[password,setPassword]=useState(''),[show,setShow]=useState(false),[busy,setBusy]=useState(false);
 useEffect(()=>{if(!isAuthenticated||!sessionToken){setMember(null);return;}const controller=new AbortController();setChecking(true);authRequest('session',{sessionToken},controller.signal).then(setMember).catch(e=>{if(e.name==='AbortError')return;setMember(null);setError(e.message);if(e.status===403)void sdk.logout();}).finally(()=>{if(!controller.signal.aborted)setChecking(false);});return()=>controller.abort();},[isAuthenticated,sessionToken]);
 useEffect(()=>{if(!member)return;const timer=setTimeout(()=>setMember(null),Math.max(0,member.expiresAt*1000-Date.now()));return()=>clearTimeout(timer);},[member]);
 async function logout(){setBusy(true);try{await authRequest('logout',{});setMember(null);await sdk.logout();setPassword('');setError('');}catch{setError('로그아웃을 완료하지 못했습니다. 다시 시도해 주세요.');}finally{setBusy(false);}}
 async function signIn(event:FormEvent){event.preventDefault();if(busy)return;setBusy(true);setError('');try{const response=await sdk.password.signIn(loginId.trim(),password);if(!response.ok)throw new Error();setPassword('');}catch{setError('아이디 또는 비밀번호가 올바르지 않습니다. 여러 번 틀리면 잠시 로그인이 잠길 수 있습니다.');}finally{setBusy(false);}}
 if(member&&isAuthenticated&&member.expiresAt*1000>Date.now())return <Suspense fallback={<LoginFrame><p role="status">대시보드를 불러오고 있습니다.</p></LoginFrame>}><App canCollect={member.isAdmin} accountControls={<button className="button" disabled={busy} onClick={()=>void logout()}><LogOut size={16}/> 로그아웃</button>}/></Suspense>;
 return <LoginFrame>{isSessionLoading||checking?<p role="status">로그인을 확인하고 있습니다.</p>:<><form onSubmit={signIn}>
  <label htmlFor="auth-id">아이디</label><input id="auth-id" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={64} value={loginId} onChange={e=>setLoginId(e.target.value)}/>
  <label htmlFor="auth-password">비밀번호</label><div className="auth-password"><input id="auth-password" name="password" type={show?'text':'password'} autoComplete="current-password" required maxLength={64} value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" className="auth-reveal" aria-label={show?'비밀번호 숨기기':'비밀번호 보기'} aria-pressed={show} onClick={()=>setShow(v=>!v)}>{show?<EyeOff size={17}/>:<Eye size={17}/>}</button></div>
  <button className="button primary" disabled={busy}><LogIn size={17}/>{busy?'확인 중…':'로그인'}</button>
 </form>{isAuthenticated&&!member&&<div className="auth-secondary"><button className="button" disabled={busy} onClick={()=>void logout()}>로그인 다시 하기</button></div>}</>}{error&&<p className="auth-error" role="alert">{error}</p>}</LoginFrame>;
}
export default function AuthGate(){const [projectId,setProjectId]=useState(''),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);useEffect(()=>{const controller=new AbortController();setError('');authRequest('config',undefined,controller.signal).then(data=>setProjectId(data.projectId)).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();},[attempt]);return projectId?<AuthProvider projectId={projectId}><SessionGate/></AuthProvider>:<LoginFrame><p role="status">{error||'로그인 연결을 확인하고 있습니다.'}</p>{error&&<button className="button" onClick={()=>setAttempt(v=>v+1)}>다시 확인</button>}</LoginFrame>;}
