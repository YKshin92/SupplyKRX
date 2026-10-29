/** Public release history shown in the app. No private quotes, account values or credentials. */
export type ReleaseTarget={tab:'market'|'explore'|'cases'|'simulation';discovery?:'pension'|'ranks';selector?:string;label:string};
export type Release={id:string;date:string;title:string;targets:ReleaseTarget[];changes:string[];verified:string;limits?:string[];superseded?:string};
export const RELEASES:Release[]=[
 {id:'2026-10-29-detail-three-month',date:'2026-10-29',title:'신호 상세도 최근 3달 기준으로 표시',
  targets:[{tab:'cases',label:'신규 순매수 추적 · 종목 상세'},{tab:'simulation',label:'전략 검증 · 거래 상세'}],
  changes:['신규 순매수 추적과 전략 검증에서 여는 종목 상세가 종목 발굴과 같은 최근 3달 수급·일봉을 기본으로 보여 줍니다.','신호일 전후 구간(신호 전 20거래일 ~ 후 40거래일, 청산 후 10거래일)은 상세 안의 ‘신호 전후’ 버튼으로 계속 볼 수 있습니다.','신호일이 최근 3달 밖이면 그 사실과 ‘신호 전후 보기’ 버튼을 표시합니다.'],
  verified:'운영 확인 2026-10-29'},
 {id:'2026-10-29-corporate-v2',date:'2026-10-29',title:'기업행사 3건 계좌 정산',
  targets:[{tab:'simulation',selector:'.corporate-reconciliation',label:'전략 검증 · 기업행사 정산 목록'}],
  changes:['박셀바이오 무상증자, 동화기업 액면분할, 삼양홀딩스 인적분할 보유분을 계좌에서 정산합니다. 정산 대기는 0건이 되고 총 평가자산과 총 손익을 다시 표시합니다.',
   '단주는 지급일이 공시되지 않아 0원으로 처리합니다(보수적). 현금으로 넣지 않습니다.',
   '무상신주는 상장일 전에는 팔지 않고 상장일 시가에 매도합니다. 회사분할은 두 종목 평가액 합계를 종가로 판정해 다음 거래일 시가에 함께 매도합니다.',
   '적용된 기업행사 목록과 근거 공시 링크, 거래 상세의 행사 후 평단과 분할 후 두 종목 수량을 표시합니다.',
   '묶여 있던 자금이 다시 매수에 쓰여 이후 매수 종목과 거래 목록이 이전 계산과 달라집니다. 매매 규칙을 바꾼 것은 아닙니다.'],
  verified:'운영 확인 2026-10-29 · Python/TS 실데이터 결과 일치',
  limits:['단주 실제 지급일·금액은 미확인','수수료·세금·배당은 미반영']},
 {id:'2026-10-29-rights-diagnostics',date:'2026-10-29',title:'정산 대기 3건 권리 수량 표시',
  targets:[{tab:'simulation',label:'전략 검증'}],
  changes:['정산 대기 종목마다 행사 전 보유 수량으로 계산한 정수 주식과 단주, 남은 확인 항목을 펼쳐 볼 수 있게 했습니다.'],
  verified:'운영 확인 2026-10-29',superseded:'같은 날 계좌 정산 반영으로 대기 목록이 비었습니다. 정산이 다시 막히는 경우에만 표시됩니다.'},
 {id:'2026-10-29-score-observation',date:'2026-10-29',title:'8항목 수급 점수 전진 검증 관측',
  targets:[{tab:'simulation',selector:'.score-research',label:'전략 검증 · 8항목 점수 관측'}],
  changes:['날짜별 8항목 점수를 바꿀 수 없는 기록으로 남기고, 실제 기록 시각·기록일 수·20거래일 관찰 완료 여부를 보여 줍니다.','아직 성과 검증 전이며 매수 판단에는 쓰지 않습니다.'],
  verified:'운영 확인 2026-10-29'},
 {id:'2026-10-28-three-month',date:'2026-10-28',title:'시장 현황·수급 발굴 최근 3달 고정',
  targets:[{tab:'explore',discovery:'pension',label:'종목 발굴 · 연기금 조건 검색'},{tab:'market',selector:'.market-flow',label:'시장 현황'}],
  changes:['조회 기간 선택을 없애고 최근 3달(62거래일)로 고정했습니다.','기관합계·사모의 과거 3개월 자료를 보완했습니다.'],
  verified:'운영 확인 2026-10-28'},
 {id:'2026-10-28-flow-ranks',date:'2026-10-28',title:'8항목 수급 순위와 4투자자 시장 흐름',
  targets:[{tab:'explore',discovery:'ranks',selector:'.rank-explorer',label:'종목 발굴 · 수급 순위 8항목'},{tab:'market',selector:'.market-flow',label:'시장 현황'}],
  changes:['외국인·기관합계·연기금·사모의 절대 순매수와 시총 대비 비중을 전체 유효 종목 기준으로 순위화한 보기를 추가했습니다.','시장 현황에 기관합계·연기금·사모 흐름과 외국인 보조 흐름을 표시합니다.'],
  verified:'운영 확인 2026-10-28'},
];
export const seoulToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
const dayNumber=(d:string)=>Date.parse(d+'T00:00:00Z')/864e5;
/** A change counts as new for seven calendar days, release day included. */
export const isRecent=(date:string,today=seoulToday(),days=7)=>{const age=dayNumber(today)-dayNumber(date);return age>=0&&age<days;};
export const recentTabs=(today=seoulToday())=>new Set(RELEASES.filter(r=>!r.superseded&&isRecent(r.date,today)).flatMap(r=>r.targets.map(t=>t.tab)));
export const recentSelectors=(today=seoulToday())=>new Set(RELEASES.filter(r=>!r.superseded&&isRecent(r.date,today)).flatMap(r=>r.targets.flatMap(t=>t.selector?[t.selector]:[])));
export const latestRelease=RELEASES[0];
