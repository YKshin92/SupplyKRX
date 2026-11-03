import {AuthProvider,useDescope,useSession} from '@descope/react-sdk';
import {lazy,Suspense,useEffect,useState,type FormEvent} from 'react';
import {Eye,EyeOff,LogIn,LogOut,Mail,ShieldCheck} from 'lucide-react';
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
 // Temporary: the existing administrator signs in with an emailed code until the ID accounts are set up (sign-in only, no sign-up;
 // the server still admits only the admin ID or the member role). Remove once the administrator ID works.
 const [mail,setMail]=useState(false),[email,setEmail]=useState(''),[sentTo,setSentTo]=useState(''),[code,setCode]=useState('');
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
 async function signIn(event:FormEvent){event.preventDefault();if(busy)return;setBusy(true);setError('');try{const response=await sdk.password.signIn(toLoginId(loginId),password);if(!response.ok)throw new Error();setPassword('');}catch{setError('아이디 또는 비밀번호가 올바르지 않습니다. 여러 번 틀리면 잠시 로그인이 잠길 수 있습니다.');}finally{setBusy(false);}}
 async function sendCode(event:FormEvent){event.preventDefault();if(busy)return;setBusy(true);setError('');try{const address=email.trim();const response=await sdk.otp.signIn.email(address);if(!response.ok)throw new Error();setSentTo(address);setCode('');}catch{setError('인증코드를 보내지 못했습니다. 등록된 관리자 이메일인지 확인해 주세요.');}finally{setBusy(false);}}
 async function verifyCode(event:FormEvent){event.preventDefault();if(busy)return;setBusy(true);setError('');try{const response=await sdk.otp.verify.email(sentTo,code.trim());if(!response.ok)throw new Error();}catch{setError('인증코드가 올바르지 않거나 만료됐습니다.');}finally{setBusy(false);}}
 if(member&&isAuthenticated)return <Suspense fallback={<LoginFrame><p role="status">대시보드를 불러오고 있습니다.</p></LoginFrame>}><App canCollect={member.isAdmin} accountControls={<button className="button" disabled={busy} onClick={()=>void logout()}><LogOut size={16}/> 로그아웃</button>}/></Suspense>;
 return <LoginFrame>{isSessionLoading||checking?<p role="status">로그인을 확인하고 있습니다.</p>:mail?<><form onSubmit={sentTo?verifyCode:sendCode}>{sentTo?<>
  <label htmlFor="auth-code">{sentTo}에 보낸 인증코드</label><input id="auth-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus value={code} onChange={e=>setCode(e.target.value)}/>
  <button className="button primary" disabled={busy}><LogIn size={17}/>{busy?'확인 중…':'인증하고 시작하기'}</button></>:<>
  <label htmlFor="auth-email">관리자 이메일</label><input id="auth-email" name="email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/>
  <button className="button primary" disabled={busy}><Mail size={17}/>{busy?'전송 중…':'인증코드 받기'}</button></>}
 </form><div className="auth-secondary"><button className="button" disabled={busy} onClick={()=>{setMail(false);setSentTo('');setCode('');setError('');}}>아이디로 로그인</button></div></>:<><form onSubmit={signIn}>
  <label htmlFor="auth-id">아이디</label><input id="auth-id" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={64} value={loginId} onChange={e=>setLoginId(e.target.value)}/>
  <label htmlFor="auth-password">비밀번호</label><div className="auth-password"><input id="auth-password" name="password" type={show?'text':'password'} autoComplete="current-password" required maxLength={64} value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" className="auth-reveal" aria-label={show?'비밀번호 숨기기':'비밀번호 보기'} aria-pressed={show} onClick={()=>setShow(v=>!v)}>{show?<EyeOff size={17}/>:<Eye size={17}/>}</button></div>
  <button className="button primary" disabled={busy}><LogIn size={17}/>{busy?'확인 중…':'로그인'}</button>
 </form><div className="auth-secondary"><button type="button" className="text-button auth-mail-link" onClick={()=>{setMail(true);setError('');}}>관리자 이메일 인증(아이디 준비 전 임시)</button>{isAuthenticated&&!member&&<button className="button" disabled={busy} onClick={()=>void logout()}>로그인 다시 하기</button>}</div></>}{error&&<p className="auth-error" role="alert">{error}</p>}</LoginFrame>;
}
export default function AuthGate(){const [projectId,setProjectId]=useState(''),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);useEffect(()=>{const controller=new AbortController();setError('');authRequest('config',undefined,controller.signal).then(data=>setProjectId(data.projectId)).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();},[attempt]);return projectId?<AuthProvider projectId={projectId} persistTokens autoRefresh><SessionGate/></AuthProvider>:<LoginFrame><p role="status">{error||'로그인 연결을 확인하고 있습니다.'}</p>{error&&<button className="button" onClick={()=>setAttempt(v=>v+1)}>다시 확인</button>}</LoginFrame>;}
