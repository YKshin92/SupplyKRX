import type {SimTrade} from './simulation-engine';
import {issueDiagnosis} from './simulation-issues';
export default function SimulationIssues({trades,open}:{trades:SimTrade[];open:(trade:SimTrade,element:HTMLElement)=>void}){
 const issues=trades.filter(t=>t.status==='unresolved');if(!issues.length)return null;
 const principal=issues.reduce((n,t)=>n+t.invested,0);
 return <section className="simulation-issues" aria-label="계산 확인이 필요한 보유 종목"><div><h3>정산 확인이 필요한 보유 {issues.length}건</h3><p>관련 매수원금 {principal.toLocaleString('ko-KR')}원 · 전체 평가자산과 수익률은 아직 확정할 수 없습니다.</p></div><div className="issue-cards">{issues.map(t=>{const d=issueDiagnosis(t)!;return <article key={t.event_id}><div><strong>{t.name}</strong><span>{d.label}</span></div><p>{d.date??'날짜 확인 필요'} · {d.description}</p>{d.source&&<p><a href={d.source} target="_blank" rel="noopener noreferrer">공식 공시 확인</a></p>}<small>묶인 매수원금 {t.invested.toLocaleString('ko-KR')}원</small><button className="button small" onClick={e=>open(t,e.currentTarget)}>문제 발생 구간 보기</button></article>;})}</div><p>확인된 손익과 현금은 별도로 표시합니다. 거래정지 구간을 임의 매매하거나 사후 제외해 성과를 높이지 않습니다.</p></section>;
}
