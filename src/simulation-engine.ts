/** Gross-price simulation. Signal selection uses only information available at entry. */
import {splitDay,type SplitPosition,type SplitAction} from './split-lifecycle.ts';
import {splitValue} from './split-valuation.ts';
import {corporateActionMap,actionStart,type CorporateContext} from './corporate-context.ts';
import {corporateStep,initialCorporatePosition,type CorporatePosition,type Forfeit,type Leg} from './corporate-lifecycle.ts';
export type {CorporateContext} from './corporate-context.ts';
export type Price={open:number|null;high:number|null;low:number|null;close:number|null;volume?:number|null;change_pct?:number|null};
export type Signal={index:number;net:number;score:number|null;absent:number;quiet_3m?:boolean|null;volume_ratio_20?:number|null};
/** sells: [session index, 연기금 net sell amount] for days with a pension net sell of at least 3억 (the smallest signal). */
export type Candidate={code:string;name:string;market:string;signals:Signal[];prices:(Price|null)[];sells?:[number,number][]};
export type SimInput={version:number;sessions:string[];stocks:Candidate[];stock_files?:string[];corporate_reconciliation?:CorporateContext|null;corporate_assets?:Record<string,(Price|null)[]>;indices:Record<string,(Price|null)[]>;source:{stocks:number;rows:number;collected_at:string;repaired_rows:number;index_as_of:string|null;price_source:string}};
/** sizing (capital mode): 'fixed' buys `budget` per signal; 'percent' buys `percent`% of the previous close's equity (cash + holdings).
 *  minBuy (capital mode): every order is at least this much; when cash is short the order uses the remaining cash, and it waits
 *  when even that is below minBuy. Left out, minBuy equals the target amount (wait for the full amount, the original rule). */
/** costs (percent of trade value): buy = brokerage fee, sell = brokerage fee + securities transaction tax. The buy fee is part
 *  of the cost basis (invested), the sell cost comes off the proceeds. Left out, nothing is charged (the original results). */
export type Settings={mode:'capital'|'unlimited';initial:number;budget:number;take:number;stop:number;start:string;filter?:'standard'|'quiet3m'|'quiet3m-volume';flowExit?:boolean;sizing?:'fixed'|'percent';percent?:number;minBuy?:number;costs?:{buy:number;sell:number}};
/** delisted: the stock's prices end for good while held (delisting, merger); settled at the last available close. */
export type Status='pending'|'skipped'|'score_missing'|'excluded'|'open'|'unresolved'|'take'|'stop'|'flow'|'delisted';
export type Horizon={status:string;stock:number|null;index:number|null;excess:number|null};
export type SimTrade={code:string;name:string;market:string;signal_date:string;event_id:string;signal_index:number;signal_net:number;score:number|null;status:Status;reason:string;entry_index:number|null;entry_date:string|null;entry_price:number|null;shares:number;invested:number;exit_date:string|null;exit_price:number|null;pnl:number|null;return_pct:number|null;trading_days:number|null;calendar_days:number|null;wait_days:number;ambiguous:boolean;flow_exit_signal?:string;horizons:Record<string,Horizon>;corporate_phase?:SplitPosition['phase']|CorporatePosition['phase'];adjusted_basis?:number;corporate_evidence_on?:string;corporate_reference_value?:number|null;fractional_claim?:{numerator:number;denominator:number};fractional_forfeit?:Forfeit[];corporate_legs?:Leg[];held_value?:number|null};
export type Ledger={date:string;morning_cash:number;buy_value:number;sale_proceeds:number;end_cash:number;holdings:number;waiting:number;equity:number|null;strategy_pnl:number|null;benchmark_pnl:number|null;unknown_cost:number};
const mean=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
const sum=(v:number[])=>v.reduce((a,b)=>a+b,0);
const positive=(v:number|null|undefined):v is number=>v!=null&&Number.isFinite(v)&&v>0;
export function priceProblem(previous:Price|null|undefined,r:Price|null|undefined):string|null{
 if(!r||[r.open,r.high,r.low,r.close].some(v=>v==null))return '일봉 가격 미수집';
 if(r.volume==null)return '거래량 미수집';if(r.volume===0)return '거래량 0 · 체결 가능 여부 미확인';
 const {open:o,high:h,low:l,close:c}=r;
 if(!positive(o)||!positive(h)||!positive(l)||!positive(c)||!positive(r.volume)||l>Math.min(o,c)||h<Math.max(o,c))return '일봉 가격 범위 미확인';
 if(positive(previous?.close)) {const change=(c/previous.close-1)*100;if(Math.abs(change)>35||Math.abs(o/previous.close-1)>.35||(r.change_pct!=null&&Math.abs(change-r.change_pct)>5))return '가격 단절 · 기업행사 확인 필요';}
 return null;
}
export function runSimulation(data:SimInput,s:Settings,corporate?:CorporateContext){
 const actionMap=corporateActionMap(corporate);
 const positions=new Map<SimTrade,SplitPosition>(),corporatePositions=new Map<SimTrade,CorporatePosition>();
 const days=data.sessions;
 if(!days.length||!/^\d{4}-\d{2}-\d{2}$/.test(s.start)||s.start<days[0]||s.start>days[days.length-1]||new Date(s.start).toISOString().slice(0,10)!==s.start)throw Error('시작일은 보유 데이터 기간 안에서 선택해 주세요.');
 if(!Number.isFinite(s.initial)||s.initial<1e4||s.initial>1e9||!Number.isFinite(s.budget)||s.budget<1e4||s.budget>1e8||!Number.isFinite(s.take)||s.take<1||s.take>100||!Number.isFinite(s.stop)||s.stop<1||s.stop>50)throw Error('입력 범위를 확인해 주세요.');
 if(s.sizing==='percent'&&(!Number.isFinite(s.percent)||s.percent!<1||s.percent!>100))throw Error('자금 비율은 1~100% 사이로 입력해 주세요.');
 if(s.minBuy!=null&&(!Number.isFinite(s.minBuy)||s.minBuy<0||s.minBuy>1e8))throw Error('최소 매수금액 범위를 확인해 주세요.');
 if(s.costs&&![s.costs.buy,s.costs.sell].every(v=>Number.isFinite(v)&&v>=0&&v<=5))throw Error('수수료·세금 비율을 확인해 주세요.');
 const buyRate=(s.costs?.buy??0)/100,sellRate=(s.costs?.sell??0)/100,costed=!!s.costs&&(buyRate>0||sellRate>0);
 const start=days.findIndex(d=>d>=s.start),byCode=new Map(data.stocks.map(c=>[c.code,c]));
 const sells=new Map(data.stocks.map(c=>[c.code,new Map(c.sells??[])]));
 const trades:SimTrade[]=data.stocks.flatMap(c=>{return c.signals.filter((e,j,all)=>e.index>=start&&(s.filter==null||s.filter==='standard'||e.quiet_3m===true&&(s.filter!=='quiet3m-volume'||e.volume_ratio_20!=null&&e.volume_ratio_20<=3))&&all.findIndex(x=>x.index===e.index)===j).map(signal=>({code:c.code,name:c.name,market:c.market,event_id:`${c.code}:${days[signal.index]}`,signal_index:signal.index,signal_date:days[signal.index],signal_net:signal.net,score:signal.score,status:s.mode==='capital'&&signal.score==null?'score_missing':'pending',reason:signal.score==null?'신호일 수급 점수 자료 부족':'다음 거래일 매수 대기',entry_index:null,entry_date:null,entry_price:null,shares:0,invested:0,exit_date:null,exit_price:null,pnl:null,return_pct:null,trading_days:null,calendar_days:null,wait_days:0,ambiguous:false,horizons:{}} as SimTrade));}).sort((a,b)=>a.signal_date.localeCompare(b.signal_date)||a.code.localeCompare(b.code));
 let cash=s.initial,benchmarkOpen:number|null=null,benchmarkStart:string|null=null,maxHoldings=0,minCash=cash;
 const ledger:Ledger[]=[],paths=new Map<SimTrade,Map<number,number>>();
 for(let i=start;i<days.length;i++){
  const heldCodes=new Set(trades.filter(t=>t.status==='open'||t.status==='unresolved').map(t=>t.code));
  for(const t of trades)if(t.status==='pending'&&t.signal_index===i-1&&heldCodes.has(t.code)){t.status='skipped';t.reason='신호 확인 시 이미 보유 중 · 추가 매수 제외';}
  const morning=cash;let buys=0,sales=0;
  // Order size is fixed before the open from what is known at the previous close (no same-day information).
  const percentMode=s.mode==='capital'&&s.sizing==='percent';
  const base=percentMode?(ledger.at(-1)?.equity??cash+sum(trades.filter(t=>t.status==='open'||t.status==='unresolved').map(t=>t.held_value??t.invested+(t.pnl??0)))):0;
  const target=percentMode?base*s.percent!/100:s.budget,partial=s.mode==='capital'&&s.minBuy!=null;
  const pending=trades.filter(t=>t.status==='pending'&&t.signal_index<i).sort((a,b)=>s.mode==='capital'?((b.score??-1)-(a.score??-1)||a.signal_date.localeCompare(b.signal_date)||a.code.localeCompare(b.code)):a.code.localeCompare(b.code));
  for(const t of pending){
   if(heldCodes.has(t.code)){t.status='skipped';t.reason='동일 종목 중복 대기 신호 제외';continue;}
   const c=byCode.get(t.code)!,r=c.prices[i],previous=c.prices[i-1];t.wait_days=i-t.signal_index-1;
   if(s.mode==='unlimited'&&i!==t.signal_index+1)continue;
   const problem=s.mode==='unlimited'?priceProblem(previous,r):!positive(r?.open)?'시가 미확인':positive(previous?.close)&&Math.abs(r!.open!/previous.close-1)>.35?'시가 단절':null;
   if(problem){t.reason=problem+' · 다음 거래일 재검토';if(s.mode==='unlimited')t.status='excluded';continue;}
   // The full order is bought when its whole shares fit in cash (the original rule). Otherwise, with a minimum set, the
   // remaining cash buys what it can as long as it is at least the minimum; without one the signal waits for cash.
   const opening=r!.open!,unit=opening*(1+buyRate),want=partial?Math.max(target,s.minBuy!):target;let shares=Math.floor(want/unit);
   if(s.mode==='capital'&&shares*unit>cash+1e-7){
    if(!partial||cash<s.minBuy!-1e-7||cash<unit){t.reason=!partial?'현금 부족 · 매도 대금 재사용 대기':cash<s.minBuy!-1e-7?'현금이 최소 매수금액보다 적음 · 매도 대금 재사용 대기':'남은 현금으로 1주도 살 수 없음 · 대기';continue;}
    shares=Math.floor(cash/unit);
   }
   const cost=costed?shares*unit:shares*opening;
   if(!shares){t.reason='1주 가격이 매수 한도 초과 · 대기';if(s.mode==='unlimited')t.status='excluded';continue;}
   heldCodes.add(t.code);
   if(s.mode==='capital')cash-=cost;buys+=cost;
   Object.assign(t,{status:'open',reason:'최신 종가 평가',entry_index:i,entry_date:days[i],entry_price:opening,shares,invested:cost});
   paths.set(t,new Map());
   if(benchmarkStart===null){benchmarkStart=days[i];benchmarkOpen=data.indices.KOSPI?.[i]?.open??null;}
  }
  minCash=Math.min(minCash,cash);maxHoldings=Math.max(maxHoldings,trades.filter(t=>t.status==='open'||t.status==='unresolved').length);
  for(const t of trades){
   if(t.status!=='open')continue;
   const action=actionMap.get(t.code);
   if(action&&t.entry_date!<actionStart(action)&&(action.kind==='bonus'||action.kind==='spinoff')){
    const c=byCode.get(t.code)!,r=c.prices[i];
    const asset=action.kind==='spinoff'?(data.corporate_assets?.[action.new_code]??byCode.get(action.new_code)?.prices)?.[i]??null:null;
    const step=corporateStep(corporatePositions.get(t)??initialCorporatePosition({entry_date:t.entry_date!,entry_price:t.entry_price!,invested:t.invested,shares:t.shares},c.prices[i-1]?.close),action,days[i],r,asset,s.take,s.stop);
    corporatePositions.set(t,step.position);
    Object.assign(t,{shares:step.shares,corporate_phase:step.position.phase,adjusted_basis:step.position.basis_price,corporate_evidence_on:action.evidence_on,corporate_reference_value:step.reference_value,fractional_forfeit:step.position.fractional_forfeit,corporate_legs:step.legs,held_value:step.held_value,status:step.status,reason:step.reason,pnl:step.pnl,return_pct:step.return_pct,exit_date:step.pnl==null?null:days[i],exit_price:step.exit_price});
    if(step.pnl!=null){paths.get(t)!.set(i,step.pnl);t.trading_days=i-t.entry_index!+1;t.calendar_days=Math.round((Date.parse(days[i])-Date.parse(t.entry_date!))/864e5);if(step.ambiguous)t.ambiguous=true;}
    if(step.cash_in){const fee=step.cash_in*sellRate;if(fee&&t.pnl!=null)t.pnl-=fee;sales+=step.cash_in-fee;if(s.mode==='capital')cash+=step.cash_in-fee;}
    continue;
   }
   if(action&&t.entry_date!<actionStart(action)){
    const c=byCode.get(t.code)!,r=c.prices[i];
    const state=splitDay(positions.get(t)??{entry_date:t.entry_date!,entry_price:t.entry_price!,invested:t.invested,shares:t.shares,basis_price:t.entry_price!,phase:'active',last_close:c.prices[i-1]?.close??t.entry_price!,applied_actions:[]},action as SplitAction,days[i],r);
    positions.set(t,state);const value=splitValue(state,r,s.take,s.stop);
    Object.assign(t,{shares:state.shares,corporate_phase:state.phase,adjusted_basis:state.basis_price,corporate_evidence_on:action.evidence_on,corporate_reference_value:value.reference_value,fractional_claim:state.fractional_claim,fractional_forfeit:state.fractional_forfeit,status:value.status==='halted'?'open':value.status,reason:value.reason??state.diagnosis??'기업행사 정산 확인 중',pnl:value.pnl,return_pct:value.return_pct,exit_date:value.pnl==null?null:days[i],exit_price:value.exit_price??(value.status==='open'?r!.close:null)});
    if(value.pnl!=null){paths.get(t)!.set(i,value.pnl);t.trading_days=i-t.entry_index!+1;t.calendar_days=Math.round((Date.parse(days[i])-Date.parse(t.entry_date!))/864e5);t.ambiguous=value.ambiguous;}
    if(value.status==='take'||value.status==='stop'){const fee=value.sale_proceeds*sellRate;if(fee&&t.pnl!=null)t.pnl-=fee;sales+=value.sale_proceeds-fee;if(s.mode==='capital')cash+=value.sale_proceeds-fee;}
    continue;
   }
   const c=byCode.get(t.code)!,r=c.prices[i],problem=priceProblem(c.prices[i-1],r);
   if(problem){
    // No tradeable bar ever again (suspension then delisting or a merger; the data end is at least 5 sessions away): settle at the
    // last tradeable close instead of freezing the account.
    if(i<=days.length-6&&!c.prices.slice(i).some((p,j)=>p&&!priceProblem(c.prices[i+j-1],p))){
     let k=i-1;while(k>t.entry_index!&&priceProblem(c.prices[k-1],c.prices[k]))k--;
     const price=c.prices[k]!.close!,gross=t.shares*price,fee=gross*sellRate,pnl=costed?Math.round((gross-fee-t.invested)*1e4)/1e4:Math.round(t.shares*(price-t.entry_price!)*1e4)/1e4;
     paths.get(t)!.set(i,pnl);
     Object.assign(t,{status:'delisted',reason:`${days[k]} 이후 가격 없음(상장폐지·합병 추정) · 마지막 종가로 정산`,exit_date:days[k],exit_price:price,pnl,return_pct:costed?pnl/t.invested*100:(price/t.entry_price!-1)*100,trading_days:k-t.entry_index!+1,calendar_days:Math.round((Date.parse(days[k])-Date.parse(t.entry_date!))/864e5)});
     sales+=t.invested+pnl;if(s.mode==='capital')cash+=t.invested+pnl;continue;
    }
    Object.assign(t,{status:'unresolved',reason:days[i]+' '+problem,pnl:null,return_pct:null,exit_date:null,exit_price:null});continue;
   }
   const entry=t.entry_price!,upper=entry*(1+s.take/100),lower=entry*(1-s.stop/100);
   let price=r!.close!,status:Status='open',reason='최신 종가 평가';
   if(t.flow_exit_signal){price=r!.open!;status='flow';reason=`${t.flow_exit_signal} 연기금 순매도가 신호일 순매수보다 커서 다음 거래일 시가 전량 매도`;}
   else if(r!.open!<=lower){price=r!.open!;status='stop';reason='손절선 아래 갭 시가 청산';}
   else if(r!.open!>=upper){price=r!.open!;status='take';reason='익절선 위 갭 시가 청산';}
   else if(r!.high!>=upper&&r!.low!<=lower){t.ambiguous=true;price=lower;status='stop';reason='같은 날 양쪽 도달 · 손절 우선';}
   else if(r!.low!<=lower){price=lower;status='stop';reason='장중 손절선 도달';}
   else if(r!.high!>=upper){price=upper;status='take';reason='장중 익절선 도달';}
   const exiting=status==='take'||status==='stop'||status==='flow';
   const pnl=costed?Math.round((t.shares*price*(exiting?1-sellRate:1)-t.invested)*1e4)/1e4:Math.round(t.shares*(price-entry)*1e4)/1e4;paths.get(t)!.set(i,pnl);
   Object.assign(t,{status,reason,exit_date:days[i],exit_price:price,pnl,return_pct:costed?pnl/t.invested*100:(price/entry-1)*100,trading_days:i-t.entry_index!+1,calendar_days:Math.round((Date.parse(days[i])-Date.parse(t.entry_date!))/864e5)});
   if(status==='take'||status==='stop'||status==='flow'){sales+=t.invested+pnl;if(s.mode==='capital')cash+=t.invested+pnl;}
   else if(s.flowExit&&(sells.get(t.code)?.get(i)??0)>t.signal_net)t.flow_exit_signal=days[i];
  }
  const held=trades.filter(t=>t.status==='open'||t.status==='unresolved'),unknown=held.filter(t=>t.pnl==null);
  const equity=s.mode==='capital'?(unknown.length?null:cash+sum(held.map(t=>t.held_value??t.invested+t.pnl!))):null;
  const indexClose=data.indices.KOSPI?.[i]?.close;
  ledger.push({date:days[i],morning_cash:morning,buy_value:buys,sale_proceeds:sales,end_cash:cash,holdings:held.length,waiting:trades.filter(t=>t.status==='pending'&&t.signal_index<i).length,equity,strategy_pnl:equity==null?null:equity-s.initial,benchmark_pnl:benchmarkStart==null?0:positive(benchmarkOpen)&&positive(indexClose)?s.initial*(indexClose/benchmarkOpen-1):null,unknown_cost:sum(unknown.map(t=>t.invested))});
  if(cash<-.000001)throw Error('현금이 음수입니다.');
 }
 for(const t of trades)for(const horizon of [5,10,20]){
  let result:Horizon={status:'not_entered',stock:null,index:null,excess:null};
  if(t.entry_index!=null){const end=t.entry_index+horizon-1;result.status='pending';
   if(end<days.length){const c=byCode.get(t.code)!,io=data.indices.KOSPI?.[t.entry_index]?.open,ic=data.indices.KOSPI?.[end]?.close;
    if(!positive(io)||!positive(ic))result.status='index_missing';
    else if(c.prices.slice(t.entry_index,end+1).some((r,j)=>priceProblem(c.prices[t.entry_index!+j-1],r)))result.status='stock_missing';
    else{const stock=(c.prices[end]!.close!/t.entry_price!-1)*100,index=(ic/io-1)*100;result={status:'complete',stock,index,excess:stock-index};}
   }
  }t.horizons[horizon]=result;
 }
 const bought=trades.filter(t=>t.invested>0),priced=bought.filter(t=>t.pnl!=null),realized=priced.filter(t=>t.status==='take'||t.status==='stop'||t.status==='flow'||t.status==='delisted'),open=priced.filter(t=>t.status==='open');
 const last=ledger[ledger.length-1],pnl=sum(priced.map(t=>t.pnl!)),unknown=sum(bought.filter(t=>t.pnl==null).map(t=>t.invested));
 let curve=ledger.map(d=>({date:d.date,strategy_pnl:d.strategy_pnl,benchmark_pnl:d.benchmark_pnl}));
 let benchmarkPnl=last.benchmark_pnl,benchmarkCount=bought.length;
 if(s.mode==='unlimited'){
  const paired=priced.filter(t=>positive(data.indices.KOSPI?.[t.entry_index!]?.open)&&positive(data.indices.KOSPI?.[days.length-1]?.close));benchmarkCount=paired.length;
  curve=ledger.map((d,j)=>{const i=start+j;let a=0,b=0,missing=false;for(const t of paired){if(t.entry_index!>i)continue;const ip=data.indices.KOSPI?.[i]?.close,io=data.indices.KOSPI?.[t.entry_index!]?.open;const value=(t.status==='take'||t.status==='stop'||t.status==='flow'||t.status==='delisted')&&t.exit_date!<=d.date?t.pnl:paths.get(t)?.get(i);if(!positive(ip)||!positive(io)||value==null){missing=true;continue;}a+=value;b+=t.invested*(ip/io-1);}return {date:d.date,strategy_pnl:missing?null:a,benchmark_pnl:missing?null:b};});
  benchmarkPnl=paired.length?sum(paired.map(t=>t.invested*(data.indices.KOSPI![days.length-1]!.close!/data.indices.KOSPI![t.entry_index!]!.open!-1))):null;
 }
 return {settings:{...s},corporate_reconciliation:corporate??null,first_date:days[start],as_of:days[days.length-1],trades,ledger,curve,
  account:{cash:last.end_cash,equity:last.equity,pnl:last.equity==null?null:last.equity-s.initial,return_pct:last.equity==null?null:(last.equity/s.initial-1)*100,max_holdings:maxHoldings,min_cash:minCash,unknown_cost:last.unknown_cost},
  summary:{signals:trades.length,bought:bought.length,invested:sum(bought.map(t=>t.invested)),pnl:unknown?null:pnl,known_pnl:pnl,unknown_invested:unknown,gains:sum(priced.map(t=>Math.max(0,t.pnl!))),losses:-sum(priced.map(t=>Math.min(0,t.pnl!))),realized_pnl:sum(realized.map(t=>t.pnl!)),unrealized_pnl:sum(open.map(t=>t.pnl!)),take:trades.filter(t=>t.status==='take').length,stop:trades.filter(t=>t.status==='stop').length,flow:trades.filter(t=>t.status==='flow').length,delisted:trades.filter(t=>t.status==='delisted').length,open:open.length,waiting:trades.filter(t=>t.status==='pending').length,take_days:mean(trades.filter(t=>t.status==='take').map(t=>t.trading_days!)),stop_days:mean(trades.filter(t=>t.status==='stop').map(t=>t.trading_days!)),flow_days:mean(trades.filter(t=>t.status==='flow').map(t=>t.trading_days!))},
  benchmark:{pnl:benchmarkPnl,count:benchmarkCount,return_pct:s.mode==='capital'?(benchmarkPnl==null?null:benchmarkPnl/s.initial*100):benchmarkCount&&benchmarkPnl!=null?benchmarkPnl/(benchmarkCount*s.budget)*100:null},
  horizons:[5,10,20].map(days=>{const p=trades.map(t=>t.horizons[days]).filter(h=>h.status==='complete');return {days,count:p.length,stock:mean(p.map(h=>h.stock!)),index:mean(p.map(h=>h.index!)),excess:mean(p.map(h=>h.excess!))};})};
}
export type SimResult=ReturnType<typeof runSimulation>;
