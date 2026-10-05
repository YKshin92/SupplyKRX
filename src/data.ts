import Papa from 'papaparse';

export type Row = {flow_status?:string;open?:number|null;high?:number|null;low?:number|null;date:string;code:string;name:string;market:string;investor:string;scope:string;buy:number|null;sell:number|null;net:number|null;buy_volume:number|null;sell_volume:number|null;net_volume:number|null;close:number|null;change_pct:number|null;volume:number|null;turnover:number|null;source:string;collected_at:string;finality:string};
export type Stock = {zero_filled_days?:number;market_cap?:number|null;sector?:string|null;metadata_date?:string;metadata_source?:string;code:string;name:string;market:string;buy:number|null;sell:number|null;net:number|null;close:number|null;price_date:string|null;change_pct:number|null;sum5:number|null;sum20:number|null;streak:number|null;streak_censored:boolean;buy_only20?:boolean;ratio20:number|null;active:boolean|null;active20:boolean;full_activity:boolean;days:number;spark:(number|null)[];source:string;finality:string};
export type Manifest={schema_version:number;investor?:string;mode:string;as_of:string;sessions:string[];calendar_checked_through:string;calendar_source:string;generated_at:string;collected_at:string;price_as_of:string|null;source:string[];scope:string;row_count:number;stock_count:number;days:number;missing_latest:number;partial20:number;generation:string;price_kind:string;status:string};
export type Dataset={manifest:Manifest;stocks:Stock[];base:string;foreignLocal?:Record<string,Row[]>;local?:Record<string,Row[]>};
export const fields=['date','code','name','market','investor','scope','buy','sell','net','buy_volume','sell_volume','net_volume','close','change_pct','volume','turnover','source','collected_at','finality','open','high','low','flow_status'];
const numbers=['open','high','low','buy','sell','net','buy_volume','sell_volume','net_volume','close','change_pct','volume','turnover'];
export const money=(n:number|null|undefined,digits=1)=>n==null?'—':new Intl.NumberFormat('ko-KR',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(n/1e8);
export const integer=(n:number|null|undefined)=>n==null?'—':new Intl.NumberFormat('ko-KR').format(n);
export const sign=(n:number|null|undefined)=>n==null?'':n>0?'positive':n<0?'negative':'neutral';
export function seoulDate(now=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function previousSession(m:Manifest,today=seoulDate()){
  // No inference beyond the supplied calendar's checked horizon.
  const checked=m.calendar_checked_through;
  const yesterday=new Date(`${today}T00:00:00Z`);yesterday.setUTCDate(yesterday.getUTCDate()-1);
  if(m.status==='calendar_unverified'||checked<yesterday.toISOString().slice(0,10))return null;
  return m.sessions.filter(d=>d<today).at(-1)??null;
}
export async function json<T>(url:string):Promise<T>{const r=await fetch(url,{cache:'no-cache'});if(!r.ok)throw new Error(`데이터를 불러오지 못했습니다 (${r.status}).`);return r.json();}
export async function loadDataset(mode:'live'|'demo',investor='연기금 등'):Promise<Dataset>{
 const root=`/data/${mode}${investor==='외국인'?'/foreign':''}`;const manifest=await json<Manifest>(`${root}/manifest.json`);
 if(manifest.schema_version!==1||manifest.mode!==mode||!/^generations\/[a-f0-9]{16}$/.test(manifest.generation))throw new Error('지원하지 않는 데이터 형식입니다.');
 const base=`${root}/${manifest.generation}`;
 return {manifest,stocks:await json<Stock[]>(`${base}/summary.json`),base};
}
function validDate(d:string){return /^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;}
export function parseCsv(text:string):Row[]{
 const parsed=Papa.parse<Record<string,string>>(text.replace(/^\uFEFF/,''),{header:true,skipEmptyLines:'greedy'});
 if(parsed.errors.length)throw new Error('CSV 구분자 또는 따옴표 형식을 확인하세요.');
 if(!fields.filter(k=>!['open','high','low','flow_status'].includes(k)).every(k=>parsed.meta.fields?.includes(k)))throw new Error('표준 CSV 헤더가 필요합니다. CSV 양식을 다운로드하세요.');
 const seen=new Set<string>();
 return parsed.data.map((raw,i)=>{
  const r:Record<string,string|number|null>={...raw};
  if(!validDate(raw.date)||!/^[0-9A-Z]{6}$/.test(raw.code)||!['KOSPI','KOSDAQ'].includes(raw.market)||!['연기금 등','외국인'].includes(raw.investor))throw new Error(`${i+2}행: 날짜·종목코드·시장·투자자 분류를 확인하세요.`);
  if(!['name','scope','source','collected_at','finality'].every(k=>raw[k]))throw new Error(`${i+2}행: 필수 출처 정보가 없습니다.`);
  if(!/(Z|[+-]\d{2}:\d{2})$/.test(raw.collected_at)||Number.isNaN(Date.parse(raw.collected_at)))throw new Error('수집 시각에는 ISO 시간대가 필요합니다.');
  if(!['unknown','provisional','final','demo'].includes(raw.finality))throw new Error('잘못된 확정 상태입니다.');
  for(const k of numbers){const v=(raw[k]??'').trim();const n=v===''?null:Number(v);if(n!==null&&(!Number.isFinite(n)||Math.abs(n)>Number.MAX_SAFE_INTEGER||(k!=='change_pct'&&!Number.isInteger(n))))throw new Error(`${i+2}행: ${k} 숫자를 확인하세요.`);r[k]=n;}
  for(const k of ['open','high','low','buy','sell','buy_volume','sell_volume','close','volume','turnover'])if(r[k]!==null&&Number(r[k])<0)throw new Error(`${k}는 음수가 될 수 없습니다.`);
  for(const [b,s,n] of [['buy','sell','net'],['buy_volume','sell_volume','net_volume']])if(r[b]!==null&&r[s]!==null){const expected=Number(r[b])-Number(r[s]);if(r[n]!==null&&r[n]!==expected)throw new Error(`${i+2}행: ${n} 불일치`);r[n]=expected;}
  if(r.volume===0&&['open','high','low'].every(k=>r[k]===0)){r.open=null;r.high=null;r.low=null;}
  if(['open','high','low','close'].every(k=>r[k]!=null)&&(Number(r.low)>Math.min(Number(r.open),Number(r.close))||Number(r.high)<Math.max(Number(r.open),Number(r.close))||Number(r.high)<Number(r.low)))throw new Error('OHLC 가격 범위 불일치');
  if(!['','reported','absent_zero','unknown'].includes(raw.flow_status??''))throw new Error('잘못된 수급 상태');
  if(raw.flow_status==='absent_zero'&&['buy','sell','net','buy_volume','sell_volume','net_volume'].some(k=>r[k]!==0))throw new Error('응답 미포함 0 처리값 불일치');
  const key=[r.date,r.code,r.investor,r.scope].join('|');if(seen.has(key))throw new Error('CSV에 중복된 거래일·종목이 있습니다.');seen.add(key);
  return r as Row;
 });
}
export function summarize(rows:Row[],sessions:string[],asOf:string,verified=true):Stock{
 if(new Set(rows.map(r=>r.investor)).size>1)throw new Error('투자자별로 나누어 계산해야 합니다.');
 const last=rows.at(-1)!;const index=new Map(rows.map(r=>[r.date,r]));const dates=sessions.filter(d=>d<=asOf).slice(-20);const latest=index.get(asOf);
 const total=(n:number)=>{const values=dates.slice(-n).map(d=>index.get(d)?.net);return verified&&values.length===n&&values.every(v=>v!=null)?values.reduce<number>((a,b)=>a+b!,0):null;};
 let streak:number|null=0;let censored=false;
 if(!verified)streak=null;else{for(const d of [...dates].reverse()){const n=index.get(d)?.net;if(n==null){streak=null;break;}if(n<=0)break;streak++;}censored=streak===dates.length;}
 const active=(r:Row|undefined):boolean|null=>!r?null:r.buy!=null&&r.sell!=null?r.buy>0||r.sell>0:r.net!=null&&r.net!==0?true:null;
 const turnovers=dates.map(d=>index.get(d)?.turnover);const denominator=turnovers.every(v=>v!=null)?turnovers.reduce<number>((a,b)=>a+b!,0):null;
 const price=[...rows].reverse().find(r=>r.close!==null);const sum20=total(20);
 return {code:last.code,name:last.name,market:last.market,buy:latest?.buy??null,sell:latest?.sell??null,net:latest?.net??null,close:price?.close??null,price_date:price?.date??null,change_pct:price?.change_pct??null,sum5:total(5),sum20,zero_filled_days:dates.filter(d=>index.get(d)?.flow_status==='absent_zero').length,buy_only20:sum20!==null&&dates.some(d=>index.get(d)!.net!>0)&&dates.every(d=>index.get(d)!.net!>=0),streak,streak_censored:censored,ratio20:sum20!==null&&denominator&&denominator>0?sum20/denominator*100:null,active:active(latest),active20:dates.some(d=>active(index.get(d))===true),full_activity:latest?.buy!=null&&latest?.sell!=null,days:dates.filter(d=>index.get(d)?.net!=null).length,spark:dates.map(d=>index.get(d)?.net??null),source:last.source,finality:latest?.finality??'unknown'};
}
export function importedDataset(rows:Row[],calendar?:{sessions:string[];checked_through:string;source:string},investor='연기금 등'):Dataset{
 const foreignLocal:Record<string,Row[]>={};
 for(const r of rows.filter(r=>r.investor==='외국인'))(foreignLocal[r.code]??=[]).push(r);
 rows=rows.filter(r=>r.investor===investor);
 if(!rows.length)throw new Error('CSV에 데이터가 없습니다.');
 if(new Set(rows.map(r=>r.scope)).size!==1)throw new Error('서로 다른 거래 범위는 나누어 가져오세요.');
 const demo=rows.some(r=>r.finality==='demo');if(demo&&rows.some(r=>r.finality!=='demo'))throw new Error('데모와 실제 데이터를 섞을 수 없습니다.');
 const sessions=calendar?.sessions??[...new Set(rows.map(r=>r.date))];
 if(!Array.isArray(sessions)||sessions.some(d=>!validDate(d)))throw new Error('거래일 달력 형식이 잘못되었습니다.');
 if(calendar&&(!validDate(calendar.checked_through)||!calendar.source||sessions.some(d=>d>calendar.checked_through)))throw new Error('달력 검증 범위를 확인하세요.');
 if(rows.some(r=>!sessions.includes(r.date)))throw new Error('거래일 달력에 없는 CSV 데이터입니다.');
 const sorted=[...new Set(sessions)].sort();const asOf=rows.map(r=>r.date).sort().at(-1)!;const local:Record<string,Row[]>={};
 for(const r of rows)(local[r.code]??=[]).push(r);
 for(const r of Object.values(local))r.sort((a,b)=>a.date.localeCompare(b.date));
 const stocks=Object.values(local).map(r=>summarize(r,sorted,asOf,!!calendar));
 return {base:'',local,foreignLocal,stocks,manifest:{schema_version:1,investor,mode:demo?'import-demo':'import',as_of:asOf,sessions:sorted,calendar_checked_through:calendar?.checked_through??asOf,calendar_source:calendar?.source??'CSV 관측일만 확인 · 거래일 달력 없음',generated_at:new Date().toISOString(),collected_at:rows.map(r=>r.collected_at).sort().at(-1)!,price_as_of:rows.filter(r=>r.close!==null).map(r=>r.date).sort().at(-1)??null,source:[...new Set(rows.map(r=>r.source))],scope:rows[0].scope,row_count:rows.length,stock_count:stocks.length,days:sorted.filter(d=>d<=asOf).slice(-20).length,missing_latest:stocks.filter(s=>s.net===null).length,partial20:stocks.filter(s=>s.sum20===null).length,generation:'',price_kind:'close',status:calendar?'validated':'calendar_unverified'}};
}
export function download(name:string,text:string){const url=URL.createObjectURL(new Blob(['\ufeff'+text],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function rowsCsv(rows:Row[]){return Papa.unparse(rows,{columns:fields,escapeFormulae:true});}
