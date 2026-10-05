import {type Stock,amountLabel} from './data';
export type Screen={net:string;days:string;capMin:string;capMax:string;sum:string;sellDays:string;sectors:string[];order:string};
export const emptyScreen:Screen={net:'',days:'',capMin:'',capMax:'',sum:'',sellDays:'',sectors:[],order:'net'};
const sectors=['전기·전자','전기·전자','IT 서비스','운송장비','전기·전자','제약','금속','운송장비','전기·전자','화학','제약','오락·문화'];
const caps=[420,130,32,45,90,38,26,34,12,8,15,2];
const codes=['005930','000660','035420','005380','373220','068270','005490','000270','247540','086520','196170','035900'];
export function demoStock(s:Stock):Stock{const index=Math.max(0,codes.indexOf(s.code));return {...s,sector:sectors[index],market_cap:caps[index]*1e12,metadata_source:'합성 데모',metadata_date:'2026-09-25'};}
export const buyDays=(s:Stock)=>s.spark.filter(n=>n!=null&&n>0).length;
export const sellDays=(s:Stock)=>s.spark.filter(n=>n!=null&&n<0).length;
export const capRatio=(s:Stock)=>s.sum20!=null&&s.market_cap?s.sum20/s.market_cap*100:null;
export function screenStock(s:Stock,f:Screen){
 const full=s.spark.length===20&&s.spark.every(n=>n!=null);
 return (f.net===''||s.net!=null&&s.net>=Number(f.net)*1e8)
 &&(f.days===''||full&&buyDays(s)>=Number(f.days))
 &&(f.sum===''||s.sum20!=null&&s.sum20>=Number(f.sum)*1e8)
 &&(f.sellDays===''||full&&sellDays(s)<=Number(f.sellDays))
 &&(f.capMin===''||s.market_cap!=null&&s.market_cap>=Number(f.capMin)*1e8)
 &&(f.capMax===''||s.market_cap!=null&&s.market_cap<=Number(f.capMax)*1e8)
 &&(!f.sectors.length||f.sectors.includes(s.sector??''));
}
export function screenValue(s:Stock,order:string){return order==='days'?buyDays(s):order==='capRatio'?capRatio(s):order==='sum20'?s.sum20:s.net;}
export default function DemoFilters({value,onChange,demo=false,sectors:sectorOptions}:{value:Screen;onChange:(v:Screen)=>void;demo?:boolean;sectors:string[]}){
 const update=(key:keyof Screen,v:string)=>onChange({...value,[key]:v});
 const input=(key:Exclude<keyof Screen,'sectors'|'order'>,label:string,max?:number)=><label>{label}<input aria-label={label} type="number" min={key==='net'||key==='sum'?undefined:0} max={max} step={max?1:'any'} placeholder="제한 없음" value={value[key]} onChange={e=>update(key,e.target.value)}/></label>;
 const invalid=Number(value.days)>20||Number(value.sellDays)>20||Number(value.days)<0||Number(value.sellDays)<0||(value.capMin!==''&&value.capMax!==''&&Number(value.capMin)>Number(value.capMax));
 return <section className="demo-screen" aria-label="종목 선별"><div className="screen-title"><strong>수급으로 찾기</strong><span>{demo?'데모 실험실':'운영 데이터'}</span><button className="text-button" onClick={()=>onChange({...emptyScreen})}>조건 초기화</button></div><p>연기금 기준 · 모든 조건을 동시에 충족 · {demo?'시총·업종도 합성 예시':'수집된 시총·업종 기준'}</p><div className="screen-grid">{input('net','최근일 순매수 최소 (억원)')}{input('days','20일 순매수 일수 최소',20)}{input('capMin','시가총액 최소 (억원)')}{input('capMax','시가총액 최대 (억원)')}</div><div className="sector-options"><span>업종 · 복수 선택</span>{sectorOptions.map(sector=><label key={sector}><input type="checkbox" checked={value.sectors.includes(sector)} onChange={()=>onChange({...value,sectors:value.sectors.includes(sector)?value.sectors.filter(x=>x!==sector):[...value.sectors,sector]})}/>{sector}</label>)}</div><details><summary>추가 수급 조건</summary><div className="screen-grid">{input('sum','20일 누적 순매수 최소 (억원)')}{input('sellDays','20일 순매도 일수 최대',20)}</div></details><label className="screen-sort">정렬<select aria-label="결과 정렬" value={value.order} onChange={e=>update('order',e.target.value)}><option value="net">최근일 순매수순</option><option value="days">순매수 일수순</option><option value="sum20">20일 누적 순매수순</option><option value="capRatio">시총 대비 20일 순매수순</option></select></label>{invalid&&<p role="alert">일수는 0~20, 시총 최소는 최대 이하로 입력하세요.</p>}<p>0원은 순매수·순매도 일수에서 제외합니다. 일수 조건은 20일 자료가 모두 있는 종목에 적용합니다.</p><div className="screen-preset"><button onClick={()=>onChange({...emptyScreen,net:'5',days:'10'})}>최근 5억+ · 10일 이상 순매수</button><button onClick={()=>onChange({...emptyScreen,days:'1',sellDays:'0'})}>20일 순매도 없음</button></div></section>;
}
