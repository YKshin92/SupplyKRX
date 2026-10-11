import type {Stock} from './data';
import {screenValue,type Screen} from './screener.ts';

export function filterProblem(f:Screen,days:number){
 for(const key of ['net','days','sellDays','sum','capMin','capMax'] as const){
  if(f[key]!==''&&!Number.isFinite(Number(f[key])))return '숫자 조건을 확인하세요.';
 }
 for(const key of ['days','sellDays'] as const){
  if(f[key]!==''&&(!Number.isInteger(Number(f[key]))||Number(f[key])<0||Number(f[key])>days))return `일수는 0~${days}의 정수로 입력하세요.`;
 }
 if([f.capMin,f.capMax].some(v=>v!==''&&Number(v)<0))return '시가총액은 0 이상으로 입력하세요.';
 if(f.capMin!==''&&f.capMax!==''&&Number(f.capMin)>Number(f.capMax))return '시가총액 최소가 최대보다 큽니다. 범위를 조정하세요.';
 return '';
}
export function compareStocks(a:Stock,b:Stock,order:string){
 const value=(s:Stock)=>{
  const ascending=order.endsWith('Asc');
  const base=order==='capAsc'||order==='capDesc'?order:ascending?order.slice(0,-3):order;
  if(base==='days'&&(!s.spark.length||s.spark.some(n=>n==null)))return null;
  const n=screenValue(s,base);
  return n==null||!Number.isFinite(n)?null:ascending&&order!=='capAsc'?-n:n;
 };
 const av=value(a),bv=value(b);
 return av===null?(bv===null?a.code.localeCompare(b.code):1):bv===null?-1:bv-av||a.code.localeCompare(b.code);
}
export const numericKeys=['net','days','sellDays','sum','capMin','capMax'] as const;
