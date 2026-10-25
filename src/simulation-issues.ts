import type {SimTrade} from './simulation-engine.ts';
export function issueDiagnosis(t:Pick<SimTrade,'code'|'status'|'reason'>){
 const date=t.reason.match(/\d{4}-\d{2}-\d{2}/)?.[0]??null;
 if(t.status!=='unresolved')return null;
 if(t.code==='007340'&&date==='2024-09-25')return {kind:'corporate',label:'액면분할·거래정지 정산 대기',date,description:'확인된 기업행사의 수량·평단과 재개 후 가격을 연결해야 합니다.'};
 if(t.code==='000070'&&date==='2025-10-30')return {kind:'corporate',label:'회사분할·거래정지 정산 대기',date,description:'존속·신설 주식과 권리의 정산 확인이 필요합니다.'};
 if(t.reason.includes('단절'))return {kind:'price_basis',label:'가격 기준·기업행사 확인 필요',date,description:'원주가와 등락률 기준이 달라 단순 손절로 확정할 수 없습니다.'};
 return {kind:'missing',label:'가격·거래 상태 확인 필요',date,description:'미수집과 실제 거래정지를 구분해 확인 중입니다. 가격을 0원으로 채우지 않습니다.'};
}
