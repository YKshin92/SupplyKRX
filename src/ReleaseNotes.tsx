import {useEffect,useState} from 'react';
import {X,Sparkles} from 'lucide-react';
import {RELEASES,isRecent,latestRelease,type ReleaseTarget} from './release-notes';
import './release-notes.css';
const KEY='supplykrx-release-seen';
const readSeen=()=>{try{return localStorage.getItem(KEY);}catch{return null;}};
const writeSeen=(id:string)=>{try{localStorage.setItem(KEY,id);}catch{/* per-viewer convenience only */}};
/** Header button + dialog listing what changed, with jumps to each changed screen. */
export default function ReleaseNotes({onNavigate}:{onNavigate:(target:ReleaseTarget)=>void}){
 const [open,setOpen]=useState(false),[seen,setSeen]=useState<string|null>(null);
 useEffect(()=>{setSeen(readSeen());},[]);
 useEffect(()=>{if(!open)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};window.addEventListener('keydown',close);return ()=>window.removeEventListener('keydown',close);},[open]);
 const unseen=seen!==latestRelease.id;
 const show=()=>{setOpen(true);writeSeen(latestRelease.id);setSeen(latestRelease.id);};
 const go=(t:ReleaseTarget)=>{setOpen(false);onNavigate(t);};
 return <>
  <button className="button release-button" aria-label={unseen?'업데이트 내역 · 새 변경 있음':'업데이트 내역'} onClick={show}><Sparkles size={17}/><span>업데이트 내역</span>{unseen&&<i className="release-dot" aria-hidden="true"/>}</button>
  {open&&<div className="modal-backdrop" onClick={()=>setOpen(false)}><section className="modal release-modal" role="dialog" aria-modal="true" aria-label="업데이트 내역" onClick={e=>e.stopPropagation()}>
   <button className="modal-close icon-button" aria-label="닫기" onClick={()=>setOpen(false)}><X/></button>
   <h2>업데이트 내역</h2><p className="release-lead">무엇이 바뀌었는지와 운영 확인 여부를 최신순으로 보여 줍니다. ‘화면 보기’를 누르면 바뀐 곳으로 이동해 잠시 강조합니다.</p>
   <ol className="release-list">{RELEASES.map(r=><li key={r.id} className={r.superseded?'superseded':''}>
    <div className="release-head"><time dateTime={r.date}>{r.date}</time>{isRecent(r.date)&&!r.superseded&&<span className="new-badge">NEW</span>}<strong>{r.title}</strong></div>
    <ul>{r.changes.map(c=><li key={c}>{c}</li>)}</ul>
    {r.superseded&&<p className="release-note">{r.superseded}</p>}
    {r.limits&&<p className="release-note">남은 제약 · {r.limits.join(' · ')}</p>}
    <div className="release-foot"><small>{r.verified}</small><span>{r.targets.map(t=><button key={t.label} className="button small" onClick={()=>go(t)}>화면 보기 · {t.label}</button>)}</span></div>
   </li>)}</ol>
  </section></div>}
 </>;
}
