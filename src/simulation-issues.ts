import type {SimTrade} from './simulation-engine.ts';
export function issueDiagnosis(t:Pick<SimTrade,'code'|'status'|'reason'>){
 const date=t.reason.match(/\d{4}-\d{2}-\d{2}/)?.[0]??null;
 if(t.status!=='unresolved')return null;
 if(t.code==='007340'&&date==='2024-09-25')return {kind:'corporate',label:'액면분할·거래정지 정산 대기',date,description:'1주→5주 분할. 2024-10-08 실제 변경상장 후 수량·평단과 가격을 함께 연결해야 합니다.',source:'https://kind.krx.co.kr/external/2024/07/19/000307/20240719000759/00591.htm'};
 if(t.code==='025900'&&date==='2024-04-12')return {kind:'corporate',label:'액면분할·거래정지 정산 대기',date,description:'1주→2.5주 분할, 2024-05-03 거래 재개. 단주 현금까지 확인해야 합니다.',source:'https://kind.krx.co.kr/external/2024/05/02/000682/20240502001733/70764.htm'};
 if(t.code==='323990'&&date==='2023-11-10')return {kind:'corporate',label:'무상증자·권리 정산 대기',date,description:'1주당 0.2주 무상배정. 신주 상장 전 매도와 단주 현금을 임의로 처리할 수 없습니다.',source:'https://kind.krx.co.kr/external/2023/10/30/000604/20231030001503/10601.htm'};
 if(t.code==='000070'&&date==='2025-10-30')return {kind:'corporate',label:'회사분할·거래정지 정산 대기',date,description:'2025-11-24 변경·재상장. 존속·신설 주식과 각각의 단주·원가 정산이 필요합니다.',source:'https://kind.krx.co.kr/external/2025/11/03/000668/20251103001533/10810.htm'};
 if(t.reason.includes('단절'))return {kind:'price_basis',label:'가격 기준·기업행사 확인 필요',date,description:'원주가와 등락률 기준이 달라 단순 손절로 확정할 수 없습니다.',source:null};
 return {kind:'missing',label:'가격·거래 상태 확인 필요',date,description:'미수집과 실제 거래정지를 구분해 확인 중입니다. 가격을 0원으로 채우지 않습니다.',source:null};
}
