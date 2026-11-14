import {useCallback,useEffect,useState} from 'react';
import './auto-trading.css';

/** 자동매매(관리자 전용): PC의 봇이 비공개 저장소에 올린 상태 문서를 /api/trading으로 읽어 보여 준다. 사이트는 주문하지 않는다. */
type Position={code:string;name:string;shares:number;entry_date:string;entry_price:number;invested:number;price:number|null;value:number|null;pnl:number|null;return_pct:number|null;take_price:number;stop_price:number;signal_date:string;sell_at_next_open:boolean};
type Closed={code:string;name:string;signal_date:string;entry_date:string;entry_price:number;exit_date:string;exit_price:number;shares:number;invested:number;pnl:number;return_pct:number;status:string;reason:string};
type Order={kind:string;date:string;code?:string;shares?:number;price?:number;amount?:number;status?:string;reason?:string;signal_date?:string};
export type TradingState={schema:1;updated_at:string;mode:'paper'|'live'|'dry-run';stopped:boolean;daily_max_buy:number;bought_today:number;
 balance:{cash:number;equity:number;held_value:number;unrealized:number;positions:Position[];halted:{code:string;name:string;shares:number;invested:number;reason:string|null}[];pending:{code:string;name:string;signal_date:string;score:number|null;reason:string|null}[]};
 history:{closed:Closed[];orders:Order[]};
 performance:{start:string|null;base:number|null;return_pct:number|null;realized:number;closed:number;wins:number;win_rate:number|null;avg_return_pct:number|null;mdd_pct:number|null;equity:{date:string;equity:number;cash:number}[]}};
type Payload={state:TradingState|null;control:{stopped:boolean;at?:string}|null;fetched_at:string};
type View='balance'|'history'|'performance';

const won=(v:number|null|undefined)=>v==null?'—':`${Math.round(v).toLocaleString('ko-KR')}원`;
const pct=(v:number|null|undefined,sign=true)=>{if(v==null)return '—';const r=Math.abs(v)<0.005?0:v;return `${sign&&r>0?'+':''}${r.toFixed(2)}%`;};
const tone=(v:number|null|undefined)=>v==null||v===0?'':v>0?'up':'down';
const MODE={paper:'모의투자',live:'실전',['dry-run']:'가상 시험'} as const;
const STATUS:Record<string,string>={take:'익절',stop:'손절',flow:'연기금 매도',buy:'매수',sell:'매도',skip:'제외',halt:'자동 주문 중지',flow_flag:'시가 매도 예약',stopped:'정지 중'};
const minutesAgo=(iso:string)=>Math.max(0,Math.round((Date.now()-Date.parse(iso))/6e4));
// 장중(평일 09:00~15:20 KST)에는 봇이 1분마다 보고한다. 10분 넘게 끊기면 손절·익절 감시가 멈춘 것일 수 있다(2026-11-11 SSL 오류로 멈춘 일).
export function marketOpenKst(now=new Date()){const k=new Date(now.getTime()+9*36e5),d=k.getUTCDay(),m=k.getUTCHours()*60+k.getUTCMinutes();return d>=1&&d<=5&&m>=540&&m<=920;}

export default function AutoTrading({initial}:{initial?:Payload}){
 const [data,setData]=useState<Payload|null>(initial??null),[error,setError]=useState(''),[loading,setLoading]=useState(!initial);
 const [view,setView]=useState<View>('balance'),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const load=useCallback(async(signal?:AbortSignal)=>{setLoading(true);try{const r=await fetch('/api/trading',{credentials:'same-origin',cache:'no-store',signal});const d=await r.json();if(!r.ok)throw Error(d.error??'자동매매 상태를 불러오지 못했습니다.');setData(d);setError('');}catch(e){if((e as Error).name!=='AbortError')setError((e as Error).message);}finally{if(!signal?.aborted)setLoading(false);}},[]);
 useEffect(()=>{if(initial)return;const c=new AbortController();void load(c.signal);const t=setInterval(()=>{if(document.visibilityState==='visible')void load();},60000);return()=>{c.abort();clearInterval(t);};},[load,initial]);
 async function control(action:'stop'|'resume'){setBusy(true);setMessage('');try{const r=await fetch('/api/trading',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Trading-Request':'1'},body:JSON.stringify({action})});const d=await r.json();if(!r.ok)throw Error(d.error??'요청을 보내지 못했습니다.');setMessage(action==='stop'?'긴급 정지를 요청했습니다. 1분 안팎으로 기록되고, 봇은 다음 확인 때(주문 직전마다) 새 주문을 멈춥니다.':'재개를 요청했습니다. 1분 안팎으로 기록되면 봇이 다시 주문합니다.');setConfirm(false);setTimeout(()=>void load(),45000);}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 const s=data?.state,requested=!!data?.control?.stopped,stale=s?minutesAgo(s.updated_at):null,silent=!!s&&stale!=null&&marketOpenKst()&&stale>10;
 return <section className="auto-trading" aria-labelledby="at-title">
  <div className="at-head"><div><div className="eyebrow">AUTO TRADING · 관리자 전용</div><h2 id="at-title">자동매매</h2>
   <p>PC에서 도는 봇의 계좌 상태입니다. 규칙은 '전략 검증 · 시뮬레이션' 기본값과 같고, 사이트는 주문을 내지 않습니다.</p></div>
   <div className="at-head-actions">{s&&<span className={`at-mode ${s.mode}`}>{MODE[s.mode]}</span>}<button className="button" disabled={loading} onClick={()=>void load()}>{loading?'불러오는 중…':'새로 고침'}</button></div></div>
  {error&&<p className="at-error" role="alert">{error}</p>}
  {silent&&<p className="at-error" role="alert">장중인데 봇 보고가 {stale}분째 없습니다. 손절·익절 감시가 멈췄을 수 있으니 PC(절전·네트워크)와 작업 스케줄러 'SupplyKRX Trader'를 확인하세요.</p>}
  {data&&<div className={`at-control${requested?' stopped':''}`}>
   <div><b>{requested?(s?.stopped?'긴급 정지 중':'정지 요청됨 · 봇 반영 대기'):s?'운영 중':'봇 연결 전'}</b>
    <span>{s?`마지막 보고 ${new Date(s.updated_at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} (${stale}분 전)`:'봇이 아직 연결되지 않았습니다.'}{s&&!silent&&!marketOpenKst()?' · 장 시간 밖(봇은 장 마감 뒤 신호 반영 후 꺼짐)':''}</span></div>
   {confirm?<div className="at-confirm"><span>{requested?'자동 주문을 다시 시작할까요?':'새 주문을 모두 멈출까요? 보유 종목은 그대로 둡니다.'}</span><button className={`button ${requested?'primary':'danger'}`} disabled={busy} onClick={()=>void control(requested?'resume':'stop')}>{busy?'요청 중…':requested?'재개':'정지'}</button><button className="button" disabled={busy} onClick={()=>setConfirm(false)}>취소</button></div>
    :<button className={`button ${requested?'primary':'danger'}`} onClick={()=>setConfirm(true)}>{requested?'자동매매 재개':'긴급 정지'}</button>}
  </div>}
  {message&&<p className="at-message" role="status">{message}</p>}
  {data&&!s&&<Empty/>}
  {s&&<>
   <div className="at-tabs" role="tablist" aria-label="자동매매 화면">{([['balance','현재 잔고'],['history','거래내역'],['performance','매매 성과']] as const).map(([k,label])=><button key={k} role="tab" aria-selected={view===k} onClick={()=>setView(k)}>{label}</button>)}</div>
   {view==='balance'&&<Balance s={s}/>}{view==='history'&&<History s={s}/>}{view==='performance'&&<Performance s={s}/>}
  </>}
 </section>;
}

function Empty(){return <div className="at-empty"><b>봇 연결 전</b><ol>
 <li>나무 PLUG(nhplug.com)에서 API 사용신청 → 앱키·시크릿, 모의투자 계좌 준비</li>
 <li>PC에 봇 설치(키는 PC의 설정 파일에만)</li>
 <li>모의투자로 연결하면 이 화면에 현재 잔고·거래내역·매매 성과가 나타납니다</li></ol></div>;}

function Tiles({items}:{items:[string,string,string?][]}){return <div className="at-tiles">{items.map(([label,value,cls])=><div key={label}><span>{label}</span><b className={cls}>{value}</b></div>)}</div>;}

function Balance({s}:{s:TradingState}){const b=s.balance;return <div className="at-view">
 <Tiles items={[['평가자산',won(b.equity)],['현금',won(b.cash)],['평가손익',won(b.unrealized),tone(b.unrealized)],['오늘 매수 / 하루 한도',`${won(s.bought_today)} / ${won(s.daily_max_buy)}`]]}/>
 <h3>보유 종목 <small>{b.positions.length}개</small></h3>
 {b.positions.length?<div className="at-table-wrap"><table className="at-table"><thead><tr><th>종목</th><th>수량</th><th>매수가</th><th>현재가</th><th>평가손익</th><th>익절선 / 손절선</th></tr></thead><tbody>
  {b.positions.map(p=><tr key={p.code}><th scope="row">{p.name}<small>{p.code} · {p.entry_date} 매수{p.sell_at_next_open?' · 다음 시가 매도 예약':''}</small></th><td data-label="수량">{p.shares.toLocaleString('ko-KR')}주</td><td data-label="매수가">{won(p.entry_price)}</td><td data-label="현재가">{won(p.price)}</td><td data-label="평가손익" className={tone(p.pnl)}>{won(p.pnl)}<small>{pct(p.return_pct)}</small></td><td data-label="익절선 / 손절선">{won(p.take_price)}<small>{won(p.stop_price)}</small></td></tr>)}
 </tbody></table></div>:<p className="at-note">보유 종목이 없습니다.</p>}
 {!!b.halted.length&&<><h3>확인 필요 <small>자동 주문 중지</small></h3><ul className="at-list warn">{b.halted.map(h=><li key={h.code}><b>{h.name}</b> {h.shares.toLocaleString('ko-KR')}주 · {h.reason}</li>)}</ul></>}
 <h3>매수 대기 신호 <small>{b.pending.length}건</small></h3>
 {b.pending.length?<ul className="at-list">{b.pending.map(p=><li key={p.code+p.signal_date}><b>{p.name}</b> {p.signal_date} 신호 · 점수 {p.score??'—'}{p.reason?` · ${p.reason}`:''}</li>)}</ul>:<p className="at-note">대기 중인 신호가 없습니다.</p>}
</div>;}

function History({s}:{s:TradingState}){const c=s.history.closed,o=s.history.orders,names=new Map<string,string>([...c,...s.balance.positions,...s.balance.halted,...s.balance.pending].map(x=>[x.code,x.name]));return <div className="at-view">
 <h3>청산한 거래 <small>{c.length}건</small></h3>
 {c.length?<div className="at-table-wrap"><table className="at-table"><thead><tr><th>종목</th><th>매수</th><th>매도</th><th>수량</th><th>손익</th><th>사유</th></tr></thead><tbody>
  {c.map(t=><tr key={t.code+t.signal_date}><th scope="row">{t.name}<small>{t.code} · 신호 {t.signal_date}</small></th><td data-label="매수">{t.entry_date}<small>{won(t.entry_price)}</small></td><td data-label="매도">{t.exit_date}<small>{won(t.exit_price)}</small></td><td data-label="수량">{t.shares.toLocaleString('ko-KR')}주</td><td data-label="손익" className={tone(t.pnl)}>{won(t.pnl)}<small>{pct(t.return_pct)}</small></td><td data-label="사유"><span className={`at-chip ${t.status}`}>{STATUS[t.status]??t.status}</span><small>{t.reason}</small></td></tr>)}
 </tbody></table></div>:<p className="at-note">아직 청산한 거래가 없습니다.</p>}
 <h3>주문·기록 <small>최근 {o.length}건</small></h3>
 {o.length?<div className="at-table-wrap"><table className="at-table log"><thead><tr><th>날짜</th><th>구분</th><th>종목</th><th>수량</th><th>가격</th><th>금액</th><th>메모</th></tr></thead><tbody>
  {o.map((e,i)=><tr key={i}><td data-label="날짜">{e.date}</td><td data-label="구분"><span className={`at-chip ${e.status??e.kind}`}>{STATUS[e.kind]??e.kind}</span></td><td data-label="종목">{e.code?names.get(e.code)??e.code:'—'}</td><td data-label="수량">{e.shares!=null?`${e.shares.toLocaleString('ko-KR')}주`:'—'}</td><td data-label="가격">{won(e.price)}</td><td data-label="금액">{won(e.amount)}</td><td data-label="메모">{e.reason??(e.signal_date?`신호 ${e.signal_date}`:'')}</td></tr>)}
 </tbody></table></div>:<p className="at-note">기록이 없습니다.</p>}
</div>;}

function Performance({s}:{s:TradingState}){const p=s.performance,eq=p.equity.slice(-30).reverse();return <div className="at-view">
 <Tiles items={[['시작 대비 수익률',pct(p.return_pct),tone(p.return_pct)],['실현 손익',won(p.realized),tone(p.realized)],['승률',p.win_rate==null?'—':`${p.win_rate}% (${p.wins}/${p.closed})`],['거래당 평균',pct(p.avg_return_pct),tone(p.avg_return_pct)],['최대 낙폭',pct(p.mdd_pct,false),p.mdd_pct?'down':'']]}/>
 <p className="at-note">시작 {p.start??'—'} · 기준 평가자산 {won(p.base)}. 같은 기간 시뮬레이션과의 비교는 거래가 쌓이면 붙입니다.</p>
 <h3>일별 평가자산 <small>최근 {eq.length}일</small></h3>
 {eq.length?<div className="at-table-wrap"><table className="at-table dated"><thead><tr><th>날짜</th><th>평가자산</th><th>현금</th><th>전일 대비</th></tr></thead><tbody>
  {eq.map((d,i)=>{const prev=eq[i+1]?.equity,chg=prev?(d.equity/prev-1)*100:null;return <tr key={d.date}><td data-label="날짜">{d.date}</td><td data-label="평가자산">{won(d.equity)}</td><td data-label="현금">{won(d.cash)}</td><td data-label="전일 대비" className={tone(chg)}>{pct(chg)}</td></tr>;})}
 </tbody></table></div>:<p className="at-note">장 마감 기록이 쌓이면 표시됩니다.</p>}
</div>;}
