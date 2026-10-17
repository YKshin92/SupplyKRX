/** Gross-price simulation. Signal selection uses only information available at entry. */
export type Price={open:number|null;high:number|null;low:number|null;close:number|null;volume?:number|null;change_pct?:number|null};
export type Signal={index:number;net:number;score:number|null;absent:number};
export type Candidate={code:string;name:string;market:string;signals:Signal[];prices:(Price|null)[]};
export type SimInput={version:number;sessions:string[];stocks:Candidate[];indices:Record<string,(Price|null)[]>;source:{stocks:number;rows:number;collected_at:string;repaired_rows:number;index_as_of:string|null;price_source:string}};
export type Settings={mode:'capital'|'unlimited';initial:number;budget:number;take:number;stop:number;start:string};
export type Status='pending'|'score_missing'|'excluded'|'open'|'unresolved'|'take'|'stop';
export type Horizon={status:string;stock:number|null;index:number|null;excess:number|null};
export type SimTrade={code:string;name:string;market:string;signal_date:string;signal_index:number;signal_net:number;score:number|null;status:Status;reason:string;entry_index:number|null;entry_date:string|null;entry_price:number|null;shares:number;invested:number;exit_date:string|null;exit_price:number|null;pnl:number|null;return_pct:number|null;trading_days:number|null;calendar_days:number|null;wait_days:number;ambiguous:boolean;horizons:Record<string,Horizon>};
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
export function runSimulation(data:SimInput,s:Settings){
 const days=data.sessions;
 if(!days.length||!/^\d{4}-\d{2}-\d{2}$/.test(s.start)||s.start<days[0]||s.start>days[days.length-1]||new Date(s.start).toISOString().slice(0,10)!==s.start)throw Error('시작일은 보유 데이터 기간 안에서 선택해 주세요.');
 if(!Number.isFinite(s.initial)||s.initial<1e4||s.initial>1e9||!Number.isFinite(s.budget)||s.budget<1e4||s.budget>1e8||!Number.isFinite(s.take)||s.take<1||s.take>100||!Number.isFinite(s.stop)||s.stop<1||s.stop>50)throw Error('입력 범위를 확인해 주세요.');
 const start=days.findIndex(d=>d>=s.start),byCode=new Map(data.stocks.map(c=>[c.code,c]));
 const trades:SimTrade[]=data.stocks.flatMap(c=>{const signal=c.signals.find(e=>e.index>=start);if(!signal)return [];return [{code:c.code,name:c.name,market:c.market,signal_index:signal.index,signal_date:days[signal.index],signal_net:signal.net,score:signal.score,status:s.mode==='capital'&&signal.score==null?'score_missing':'pending',reason:signal.score==null?'신호일 수급 점수 자료 부족':'다음 거래일 매수 대기',entry_index:null,entry_date:null,entry_price:null,shares:0,invested:0,exit_date:null,exit_price:null,pnl:null,return_pct:null,trading_days:null,calendar_days:null,wait_days:0,ambiguous:false,horizons:{}} as SimTrade];}).sort((a,b)=>a.signal_date.localeCompare(b.signal_date)||a.code.localeCompare(b.code));
 let cash=s.initial,benchmarkOpen:number|null=null,benchmarkStart:string|null=null,maxHoldings=0,minCash=cash;
 const ledger:Ledger[]=[],paths=new Map<SimTrade,Map<number,number>>();
 for(let i=start;i<days.length;i++){
  const morning=cash;let buys=0,sales=0;
  const pending=trades.filter(t=>t.status==='pending'&&t.signal_index<i).sort((a,b)=>s.mode==='capital'?((b.score??-1)-(a.score??-1)||a.signal_date.localeCompare(b.signal_date)||a.code.localeCompare(b.code)):a.code.localeCompare(b.code));
  for(const t of pending){
   const c=byCode.get(t.code)!,r=c.prices[i],previous=c.prices[i-1];t.wait_days=i-t.signal_index-1;
   if(s.mode==='unlimited'&&i!==t.signal_index+1)continue;
   const problem=s.mode==='unlimited'?priceProblem(previous,r):!positive(r?.open)?'시가 미확인':positive(previous?.close)&&Math.abs(r!.open!/previous.close-1)>.35?'시가 단절':null;
   if(problem){t.reason=problem+' · 다음 거래일 재검토';if(s.mode==='unlimited')t.status='excluded';continue;}
   const opening=r!.open!,shares=Math.floor(s.budget/opening),cost=shares*opening;
   if(!shares){t.reason='1주 가격이 매수 한도 초과 · 대기';if(s.mode==='unlimited')t.status='excluded';continue;}
   if(s.mode==='capital'&&cost>cash+1e-7){t.reason='현금 부족 · 매도 대금 재사용 대기';continue;}
   if(s.mode==='capital')cash-=cost;buys+=cost;
   Object.assign(t,{status:'open',reason:'최신 종가 평가',entry_index:i,entry_date:days[i],entry_price:opening,shares,invested:cost});
   paths.set(t,new Map());
   if(benchmarkStart===null){benchmarkStart=days[i];benchmarkOpen=data.indices.KOSPI?.[i]?.open??null;}
  }
  minCash=Math.min(minCash,cash);maxHoldings=Math.max(maxHoldings,trades.filter(t=>t.status==='open'||t.status==='unresolved').length);
  for(const t of trades){
   if(t.status!=='open')continue;
   const c=byCode.get(t.code)!,r=c.prices[i],problem=priceProblem(c.prices[i-1],r);
   if(problem){Object.assign(t,{status:'unresolved',reason:days[i]+' '+problem,pnl:null,return_pct:null,exit_date:null,exit_price:null});continue;}
   const entry=t.entry_price!,upper=entry*(1+s.take/100),lower=entry*(1-s.stop/100);
   let price=r!.close!,status:Status='open',reason='최신 종가 평가';
   if(r!.open!<=lower){price=r!.open!;status='stop';reason='손절선 아래 갭 시가 청산';}
   else if(r!.open!>=upper){price=r!.open!;status='take';reason='익절선 위 갭 시가 청산';}
   else if(r!.high!>=upper&&r!.low!<=lower){t.ambiguous=true;price=lower;status='stop';reason='같은 날 양쪽 도달 · 손절 우선';}
   else if(r!.low!<=lower){price=lower;status='stop';reason='장중 손절선 도달';}
   else if(r!.high!>=upper){price=upper;status='take';reason='장중 익절선 도달';}
   const pnl=Math.round(t.shares*(price-entry)*1e4)/1e4;paths.get(t)!.set(i,pnl);
   Object.assign(t,{status,reason,exit_date:days[i],exit_price:price,pnl,return_pct:(price/entry-1)*100,trading_days:i-t.entry_index!+1,calendar_days:Math.round((Date.parse(days[i])-Date.parse(t.entry_date!))/864e5)});
   if(status==='take'||status==='stop'){sales+=t.invested+pnl;if(s.mode==='capital')cash+=t.invested+pnl;}
  }
  const held=trades.filter(t=>t.status==='open'||t.status==='unresolved'),unknown=held.filter(t=>t.status==='unresolved');
  const equity=s.mode==='capital'?(unknown.length?null:cash+sum(held.map(t=>t.invested+t.pnl!))):null;
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
 const bought=trades.filter(t=>t.invested>0),priced=bought.filter(t=>t.pnl!=null),realized=priced.filter(t=>t.status==='take'||t.status==='stop'),open=priced.filter(t=>t.status==='open');
 const last=ledger[ledger.length-1],pnl=sum(priced.map(t=>t.pnl!)),unknown=sum(bought.filter(t=>t.pnl==null).map(t=>t.invested));
 let curve=ledger.map(d=>({date:d.date,strategy_pnl:d.strategy_pnl,benchmark_pnl:d.benchmark_pnl}));
 let benchmarkPnl=last.benchmark_pnl,benchmarkCount=bought.length;
 if(s.mode==='unlimited'){
  const paired=priced.filter(t=>positive(data.indices.KOSPI?.[t.entry_index!]?.open)&&positive(data.indices.KOSPI?.[days.length-1]?.close));benchmarkCount=paired.length;
  curve=ledger.map((d,j)=>{const i=start+j;let a=0,b=0,missing=false;for(const t of paired){if(t.entry_index!>i)continue;const ip=data.indices.KOSPI?.[i]?.close,io=data.indices.KOSPI?.[t.entry_index!]?.open;const value=(t.status==='take'||t.status==='stop')&&t.exit_date!<=d.date?t.pnl:paths.get(t)?.get(i);if(!positive(ip)||!positive(io)||value==null){missing=true;continue;}a+=value;b+=t.invested*(ip/io-1);}return {date:d.date,strategy_pnl:missing?null:a,benchmark_pnl:missing?null:b};});
  benchmarkPnl=paired.length?sum(paired.map(t=>t.invested*(data.indices.KOSPI![days.length-1]!.close!/data.indices.KOSPI![t.entry_index!]!.open!-1))):null;
 }
 return {settings:{...s},first_date:days[start],as_of:days[days.length-1],trades,ledger,curve,
  account:{cash:last.end_cash,equity:last.equity,pnl:last.equity==null?null:last.equity-s.initial,return_pct:last.equity==null?null:(last.equity/s.initial-1)*100,max_holdings:maxHoldings,min_cash:minCash,unknown_cost:last.unknown_cost},
  summary:{signals:trades.length,bought:bought.length,invested:sum(bought.map(t=>t.invested)),pnl:unknown?null:pnl,known_pnl:pnl,unknown_invested:unknown,gains:sum(priced.map(t=>Math.max(0,t.pnl!))),losses:-sum(priced.map(t=>Math.min(0,t.pnl!))),realized_pnl:sum(realized.map(t=>t.pnl!)),unrealized_pnl:sum(open.map(t=>t.pnl!)),take:trades.filter(t=>t.status==='take').length,stop:trades.filter(t=>t.status==='stop').length,open:open.length,waiting:trades.filter(t=>t.status==='pending').length,take_days:mean(trades.filter(t=>t.status==='take').map(t=>t.trading_days!)),stop_days:mean(trades.filter(t=>t.status==='stop').map(t=>t.trading_days!))},
  benchmark:{pnl:benchmarkPnl,count:benchmarkCount,return_pct:s.mode==='capital'?(benchmarkPnl==null?null:benchmarkPnl/s.initial*100):benchmarkCount&&benchmarkPnl!=null?benchmarkPnl/(benchmarkCount*s.budget)*100:null},
  horizons:[5,10,20].map(days=>{const p=trades.map(t=>t.horizons[days]).filter(h=>h.status==='complete');return {days,count:p.length,stock:mean(p.map(h=>h.stock!)),index:mean(p.map(h=>h.index!)),excess:mean(p.map(h=>h.excess!))};})};
}
export type SimResult=ReturnType<typeof runSimulation>;
