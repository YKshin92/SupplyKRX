import type {TrackingEvent} from './tracking';
export default function TouchOutcome({event}:{event:TrackingEvent}){
 const r=event.touch_outcome;
 if(!r)return <span className="outcome-badge">도달 결과 갱신 중</span>;
 const label={take:'+30% 익절 먼저',stop:'−10% 손절 먼저',open:'미도달',pending:'진입 대기',missing:'가격 자료 미확인'}[r.status];
 const touch=(hit:boolean|null,date:string|null)=>hit?date:hit===false?'미도달':'미확인';
 return <><strong className={r.status==='take'?'positive':r.status==='stop'?'negative':''}>{label}</strong><small>{r.first_date??''}{r.trading_days!=null?` · ${r.trading_days}거래일`:''}</small><small>+30% {touch(r.take_touched,r.first_take_date)}</small><small>−10% {touch(r.stop_touched,r.first_stop_date)}</small>{r.ambiguous&&<small>같은 날 양쪽 도달 · 순서 미확인, 손절 우선 가정</small>}{!r.scan_complete&&<small>{r.reason??'이후 가격 미확인'}</small>}</>;
}
