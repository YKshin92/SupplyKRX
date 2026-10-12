import {useEffect,useRef,useState} from 'react';
import {RefreshCw} from 'lucide-react';
type Run={id:number;status:string;conclusion:string|null;url:string};
type Result={run:Run|null;requestedAt?:string;error?:string};
export default function CollectButton({collectedAt,onUpdated}:{collectedAt?:string;onUpdated:()=>void}) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[runUrl,setRunUrl]=useState('');
  const control=useRef<AbortController|null>(null);
  useEffect(()=>()=>control.current?.abort(),[]);
  async function collect(){
    if(busy)return;
    const controller=new AbortController();control.current=controller;
    setBusy(true);setMessage('GitHub 수집 요청 중…');setRunUrl('');
    const pause=()=>new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{controller.signal.removeEventListener('abort',stop);resolve();},5000);const stop=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));};controller.signal.addEventListener('abort',stop,{once:true});});
    async function request(url:string,post=false):Promise<Result>{const response=await fetch(url,{method:post?'POST':'GET',cache:'no-store',credentials:'same-origin',headers:post?{'X-Collection-Request':'1'}:undefined,signal:controller.signal});const content=response.headers.get('content-type')??'';if(!content.includes('application/json'))throw new Error('수동 수집 서버에 연결하지 못했습니다. 운영 사이트에서 사용해 주세요.');const result=await response.json();if(!response.ok)throw new Error(result.error??'수집 요청 실패');return result;}
    try{
      let result=await request('/api/collect',true);const after=result.requestedAt??new Date().toISOString();const deadline=Date.now()+12*60*1000;
      while(Date.now()<deadline){
        const run=result.run;
        if(run){setRunUrl(run.url);if(run.status==='completed'){if(run.conclusion!=='success')throw new Error(`수집 작업 ${run.conclusion??'실패'} · 실행 내역을 확인해 주세요.`);setMessage('수집 완료 · 홈페이지 반영을 확인하는 중…');break;}setMessage(run.status==='in_progress'?'데이터 수집 중…':'GitHub 실행 대기 중…');}else setMessage('GitHub 실행 접수 확인 중…');
        await pause();result=await request(run?`/api/collect?run=${run.id}`:`/api/collect?after=${encodeURIComponent(after)}`);
      }
      if(result.run?.status!=='completed')throw new Error('실행 확인 시간이 초과됐습니다. GitHub 실행 내역을 확인해 주세요.');
      while(Date.now()<deadline){
        const response=await fetch('/data/live/manifest.json',{cache:'no-store',signal:controller.signal});
        if(response.ok){const manifest=await response.json();if(manifest.collected_at!==collectedAt){onUpdated();setMessage('수집 데이터가 화면에 반영됐습니다.');return;}}
        await pause();
      }
      setMessage('수집은 완료됐습니다. 배포 반영을 기다린 뒤 페이지를 다시 열어 주세요.');
    }catch(error){if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:'수집 요청 실패');}
    finally{if(!controller.signal.aborted)setBusy(false);}
  }
  return <div className="collection-control"><button className="button" disabled={busy} onClick={()=>void collect()} title="GitHub에서 연기금·외국인 데이터를 수집합니다"><RefreshCw size={17} className={busy?'spin':''}/>{busy?'수집 진행 중':'데이터 수집'}</button>{message&&<div className="collection-message" role="status">{message}{runUrl&&<> <a href={runUrl} target="_blank" rel="noreferrer">실행 내역</a></>}</div>}</div>;
}
