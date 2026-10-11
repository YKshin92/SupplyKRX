import type {Stock} from './data';
export type Screen={net:string;days:string;capMin:string;capMax:string;sum:string;sellDays:string;sectors:string[];order:string};
export const emptyScreen:Screen={net:'',days:'',capMin:'',capMax:'',sum:'',sellDays:'',sectors:[],order:'net'};
const sectors=['전기·전자','전기·전자','IT 서비스','운송장비','전기·전자','제약','금속','운송장비','전기·전자','화학','제약','오락·문화'];
const caps=[420,130,32,45,90,38,26,34,12,8,15,2];
const codes=['005930','000660','035420','005380','373220','068270','005490','000270','247540','086520','196170','035900'];
export function demoStock(s:Stock):Stock{const index=Math.max(0,codes.indexOf(s.code));return {...s,sector:sectors[index],market_cap:caps[index]*1e12,metadata_source:'합성 데모',metadata_date:'2026-09-25'};}
export const buyDays=(s:Stock)=>s.spark.filter(n=>n!=null&&n>0).length;
export const sellDays=(s:Stock)=>s.spark.filter(n=>n!=null&&n<0).length;
export const capRatio=(s:Stock)=>s.sum20!=null&&s.market_cap?s.sum20/s.market_cap*100:null;
export function screenStock(s:Stock,f:Screen,days=20){
 const full=s.spark.length===days&&s.spark.every(n=>n!=null);
 return (f.net===''||s.net!=null&&s.net>=Number(f.net)*1e8)
 &&(f.days===''||full&&buyDays(s)>=Number(f.days))
 &&(f.sum===''||s.sum20!=null&&s.sum20>=Number(f.sum)*1e8)
 &&(f.sellDays===''||full&&sellDays(s)<=Number(f.sellDays))
 &&(f.capMin===''||s.market_cap!=null&&s.market_cap>=Number(f.capMin)*1e8)
 &&(f.capMax===''||s.market_cap!=null&&s.market_cap<=Number(f.capMax)*1e8)
 &&(!f.sectors.length||f.sectors.includes(s.sector??''));
}
export function screenValue(s:Stock,order:string){
 if(order==='capDesc'||order==='capAsc')return s.market_cap==null?null:order==='capAsc'?-s.market_cap:s.market_cap;
 return order==='days'?buyDays(s):order==='capRatio'?capRatio(s):order==='sum20'?s.sum20:s.net;
}
