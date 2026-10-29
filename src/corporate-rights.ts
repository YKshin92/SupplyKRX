/** Diagnostic rights only: never mutates trades, cash or execution thresholds. */
import actions from '../collector/corporate_actions.json' with {type:'json'};
type Holding={code:string;status:string;reason:string;entry_date:string|null;shares:number;corporate_phase?:string};
export function corporateRights(t:Holding,asOf:string){
 if(t.status!=='unresolved'||t.corporate_phase||!t.entry_date||!Number.isSafeInteger(t.shares)||t.shares<=0||t.shares>Number.MAX_SAFE_INTEGER/5)return null;
 const a=actions.find(a=>a.code===t.code&&t.reason.includes(a.issue_date));
 if(!a||t.entry_date>=a.issue_date||asOf<a.issue_date)return null;
 const leg=(name:string,ratio:string,available:string|null)=>{
  const [whole,decimal='']=ratio.split('.'),denominator=10n**BigInt(decimal.length);
  const numerator=BigInt(whole+decimal)*BigInt(t.shares),quantity=numerator/denominator,remainder=numerator%denominator;
  const gcd=(a:bigint,b:bigint):bigint=>b===0n?a:gcd(b,a%b),g=gcd(remainder,denominator);
  const fractionDecimal=remainder===0n?null:`0.${String(remainder).padStart(decimal.length,'0').replace(/0+$/,'')}`;
  return {name,whole:Number(quantity),fraction:remainder===0n?null:`${remainder/g}/${denominator/g}`,fractionDecimal,available,listed:available!==null&&available<=asOf};
 };
 let legs;
 if(a.kind==='split')legs=[leg('분할 후 주식',a.ratio!,a.resume_date!)];
 else if(a.kind==='bonus')legs=[leg('기존 주식','1',null),leg('무상배정 신주',a.ratio!,a.listing_date!)];
 else if(a.kind==='spinoff')legs=[leg('존속 주식',a.retained_ratio!,a.resume_date!),leg(a.new_name!,a.new_ratio!,a.resume_date!)];
 else return null;
 const fractional=legs.some(l=>l.fraction!==null);
 return {original:t.shares,legs,cashCredited:0,settled:false,
  blockers:a.kind==='bonus'?['권리락 이후 기존 주식·미상장 신주를 합산하는 평가 및 매도 규칙',...(fractional?['단주 지급일·원 단위 정산 확인']:[])]:
   a.kind==='split'?[...(fractional?['단주 대금 산정 기준·금액·지급일 확인']:[]),'행사 후 수량과 조정평단을 적용한 계좌 재계산']:
   ['존속·신설 종목의 원가 배분과 두 자산 합산 매도 규칙','신설 종목 일봉 확인',...(fractional?['존속·신설 주식 각각의 단주 금액·지급일 확인']:[])],
  cashRule:a.kind==='bonus'&&fractional?'단주 현금은 신주 상장 초일 종가 기준 · 실제 지급일 미확인':null,
  source:a.source,listingSource:a.kind==='bonus'?'https://kind.krx.co.kr/external/2023/11/27/000543/20231127001403/70791.htm':null};
}
