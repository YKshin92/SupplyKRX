/** Protected Cutler RSI monitoring snapshot produced at build time (collector/rsi.py). */
export type RsiState='below30'|'neutral'|'above70'|null;
export type RsiSummary={rsi:number|null;prev_rsi:number|null;state:RsiState;entry_today:boolean;below_streak:number;last_entry_date:string|null;reason:string|null};
export type RsiStock=RsiSummary&{code:string;name:string;market:string;close:number|null;change_pct:number|null;observed:number};
export type RsiIndex={summary:RsiSummary;series:{date:string;close:number|null;rsi:number|null}[]};
export type RsiData={schema_version:1;as_of:string;rules:Record<string,string|number>;population:number;computed:number;below30:number;entries_today:number;missing:Record<string,number>;indices:Record<string,RsiIndex>;stocks:RsiStock[]};
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
