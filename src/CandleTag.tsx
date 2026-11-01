/** Signal-day candle tag (reference only; no rule or score uses it). 양봉 red / 음봉 blue as on Korean charts. */
export type Candle='bull'|'bear'|'flat';
export const candleOf=(open:number|null|undefined,close:number|null|undefined):Candle|null=>open==null||close==null||!(open>0)||!(close>0)?null:close>open?'bull':close<open?'bear':'flat';
const LABEL:Record<Candle,string>={bull:'양봉',bear:'음봉',flat:'보합'};
const NOTE='신호일 종가가 시가보다 높으면 양봉, 낮으면 음봉 · 매수 참고 지표(과거 3년 탐색에서는 음봉 신호의 거래당 성과가 더 좋았으나 5년 검증 전)';
export default function CandleTag({candle}:{candle?:Candle|null}){
 if(!candle)return null;
 return <span className={`candle-tag ${candle}`} title={NOTE}>{LABEL[candle]}</span>;
}
