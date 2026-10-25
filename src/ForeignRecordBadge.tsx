import {amountLabel} from './data';
import type {ForeignRecord} from './tracking';

export default function ForeignRecordBadge({record,detail=false}:{record?:ForeignRecord;detail?:boolean}){
 if(record?.status!=='record')return null;
 const explanation=`신호 당일 외국인 순매도 ${amountLabel(record.signal_net==null?null:-record.signal_net)} · 직전 20거래일 최대 ${amountLabel(record.prior_max_sell)} 초과 · 순매도대금 기준 · 점수·매수 제외에 미반영`;
 return <div className={detail?'foreign-record-detail':'foreign-record-wrap'}><span className="foreign-record-badge" title={explanation}>외국인 20일 최대 순매도</span>{detail&&<p>{explanation}</p>}</div>;
}
