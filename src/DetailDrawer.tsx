import {useEffect,useRef,useState,type ReactNode} from 'react';
import {X,ChevronLeft,ChevronRight} from 'lucide-react';
import {createPortal} from 'react-dom';

export default function DetailDrawer({children,onClose,name,previous,next}:{children:ReactNode;onClose:()=>void;name:string;previous?:()=>void;next?:()=>void}){
 const box=useRef<HTMLElement>(null),close=useRef<HTMLButtonElement>(null);
 const [mobile,setMobile]=useState(()=>window.matchMedia('(max-width: 760px)').matches);
 const closeAction=useRef(onClose);closeAction.current=onClose;
 useEffect(()=>{const mq=window.matchMedia('(max-width: 760px)');const update=()=>setMobile(mq.matches);mq.addEventListener('change',update);return()=>mq.removeEventListener('change',update);},[]);
 useEffect(()=>{close.current?.focus({preventScroll:true});},[]);
 useEffect(()=>{
  const root=document.getElementById('explorer-root'),overflow=document.body.style.overflow;
  if(mobile){root?.setAttribute('inert','');document.body.style.overflow='hidden';if(!box.current?.contains(document.activeElement))close.current?.focus({preventScroll:true});}
  const key=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeAction.current();}
   if(mobile&&e.key==='Tab'){
    const nodes=[...box.current!.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,select,summary,[tabindex="0"]')].filter(n=>n.getClientRects().length);
    const first=nodes[0],last=nodes.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
   }
  };
  document.addEventListener('keydown',key);
  return()=>{root?.removeAttribute('inert');if(mobile)document.body.style.overflow=overflow;document.removeEventListener('keydown',key);};
 },[mobile]);
 return createPortal(<section ref={box} className="detail-drawer" role="dialog" aria-modal={mobile} aria-label={`${name} 종목 상세 분석`}><div className="drawer-toolbar"><span>종목 상세 분석</span><div><button className="icon-button" aria-label="이전 종목 분석" disabled={!previous} onClick={previous}><ChevronLeft size={17}/></button><button className="icon-button" aria-label="다음 종목 분석" disabled={!next} onClick={next}><ChevronRight size={17}/></button><button ref={close} className="icon-button" aria-label="종목 분석 닫기" onClick={onClose}><X size={19}/></button></div></div><div className="drawer-content">{children}</div></section>,document.body);
}
