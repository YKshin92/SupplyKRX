/** Protected RSI(14) monitoring snapshot (main: Wilder, secondary: Cutler) produced at build time (collector/rsi.py). */
export type RsiState='below30'|'neutral'|'above70'|null;
export type RsiSummary={rsi:number|null;prev_rsi:number|null;state:RsiState;entry_today:boolean;below_streak:number;last_entry_date:string|null;reason:string|null;cutler?:number|null;since_reset?:number};
export type RsiStock=RsiSummary&{code:string;name:string;market:string;close:number|null;change_pct:number|null;observed:number};
export type RsiIndex={summary:RsiSummary;series:{date:string;close:number|null;rsi:number|null}[]};
export type RsiPoint={date:string;close:number|null;rsi:number|null;cutler?:number|null};
/** Wilder depends on its start: fewer than 60 changes since a restart is shown as not yet settled. */
export const unsettled=(s:{since_reset?:number;rsi:number|null})=>s.rsi!=null&&(s.since_reset??0)<60;
export type DomesticTop=RsiStock&{rank:number;market_cap:number;series:RsiPoint[]};
export type UsTop=RsiSummary&{rank:number;symbol:string;name:string;market_cap_usd:number|null;close:number|null;last_date:string|null;series:RsiPoint[]};
export type UsBlock={as_of:string|null;collected_at:string|null;cap_date:string|null;cap_source:string|null;price_source:string|null;currency:'USD';price_basis:string;indices:Record<string,RsiIndex&{symbol?:string}>;top30:UsTop[]};
export type RsiData={schema_version:1;as_of:string;rules:Record<string,string|number>;population:number;computed:number;below30:number;entries_today:number;missing:Record<string,number>;indices:Record<string,RsiIndex>;domestic_top30?:{cap_date:string|null;cap_source:string;items:DomesticTop[]}|null;us?:UsBlock|null;stocks:RsiStock[]};
type Reader=<T>(path:string)=>Promise<T>;
const json:Reader=path=>import('./data.ts').then(d=>d.json(path));
let cache:Promise<RsiData>|null=null;
export function validRsi(d:unknown):d is RsiData{
 const x=d as RsiData;
 return !!x&&x.schema_version===1&&/^\d{4}-\d{2}-\d{2}$/.test(x.as_of)&&Array.isArray(x.stocks)&&typeof x.indices==='object'&&x.stocks.every(s=>/^[0-9A-Z]{6}$/.test(s.code)&&(s.rsi===null||(s.rsi>=0&&s.rsi<=100)));
}
export function readRsi(read:Reader=json):Promise<RsiData>{
 if(!cache){cache=read<RsiData>('/data/live/rsi/latest.json').then(d=>{if(!validRsi(d))throw Error('RSI 자료 형식 확인 필요');return d;});cache.catch(()=>{cache=null;});}
 return cache;
}
export const stateLabel=(s:RsiState)=>s==='below30'?'30 미만':s==='above70'?'70 이상':s==='neutral'?'30~70':'산출 불가';
export const reasonLabel=(r:string|null)=>r==='warmup'?'관측 부족(15거래일 미만)':r==='flat'?'14일 보합':r==='invalid'?'기준일 거래 없음':r==='break'?'가격 단절 후 재시작':'';
