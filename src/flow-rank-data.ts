import {parallelParts,sessionData} from './history-cache.ts';

export const rankInvestors=['연기금 등','외국인','기관합계','사모'] as const;
export type RankComponent={value:number|null;rank:number|null;population:number;points:number|null;observations:number};
/** 연기금 markers (2026-11-06): quiet_3m = no 연기금 buy and sells under 1억 over the 3 calendar months before the as-of day;
 *  first_buy = quiet_3m and a buy on the as-of day; signal = quiet_3m, net >= 3억, volume <= 3x the 20-session mean. null = history too short. */
export type PensionMarker={quiet_3m:boolean|null;first_buy:boolean|null;signal:boolean|null;net:number|null;volume_ratio_20?:number|null};
export type RankStock={code:string;name:string;market:string;market_cap:number|null;score:number|null;known_points:number;components:Record<string,RankComponent>;
 score_rank?:number|null;previous_score_rank?:number|null;rank_change?:number|null;new_entry?:boolean|null;pension_score?:number|null;caution?:string[];pension?:PensionMarker};
export const RANK_VIEWS=[['latest','최근일'],['5d','5일'],['20d','20일'],['3m','3개월']] as const;
export type RankView=typeof RANK_VIEWS[number][0];
export type RankManifest={version:string;state:string;reason?:string;as_of:string;previous_as_of?:string|null;pension_coverage?:string;first_date:string;sessions:number;population:number;market_cap_date:string;weighting:string;note:string;warmup_coverage:string;universe:{classification_status:string;classification_observed_date:string};generation?:string;files?:string[]};
export function rankPaths(m:RankManifest){
 if(m.state!=='ready')return [];
 if(m.version!=='flow-rank-equal8-v1')throw new Error('지원하지 않는 수급 순위 버전입니다.');
 if(!/^generations\/[a-f0-9]{20}$/.test(m.generation??'')||!Array.isArray(m.files)||!m.files.length||m.files.length>100||new Set(m.files).size!==m.files.length||m.files.some(f=>!/^ranks-\d{3}\.json$/.test(f)))throw new Error('수급 순위 파일 경로를 확인할 수 없습니다.');
 return m.files.map(f=>`/data/live/flow-ranks/${m.generation}/${f}`);
}
async function read<T>(url:string):Promise<T>{const r=await fetch(url,{cache:'no-cache'});if(!r.ok)throw new Error(`수급 순위를 불러오지 못했습니다 (${r.status}).`);return r.json();}
export async function loadRanks(view:string,asOf:string,revision=''){
 if(!['latest','5d','20d','1m','2m','3m'].includes(view))throw new Error('조회 기간을 확인하세요.');
 return sessionData(`flow-ranks:${asOf}:${revision}:${view}`,async()=>{
  const manifest=await read<RankManifest>(`/data/live/flow-ranks/${view}.json`);
  const paths=rankPaths(manifest);
  const stocks=(await parallelParts(paths,url=>read<RankStock[]>(url))).flat();
  if(manifest.state==='ready'&&(stocks.length!==manifest.population||new Set(stocks.map(s=>s.code)).size!==stocks.length))throw new Error('수급 순위의 종목 수가 일치하지 않습니다.');
  return {manifest,stocks};
 });
}
export function rankValue(s:RankStock,key:string){return key==='score'?s.score:key==='pension_score'?s.pension_score??null:key==='rank_change'?s.rank_change??null:key==='market_cap'?s.market_cap:s.components[key]?.value??null;}
export function compareRanks(a:RankStock,b:RankStock,key:string,ascending=false){
 const x=rankValue(a,key),y=rankValue(b,key);
 if(x==null&&y!=null)return 1;if(x!=null&&y==null)return -1;
 return x!=null&&y!=null&&x!==y?(ascending?x-y:y-x):a.code.localeCompare(b.code);
}
