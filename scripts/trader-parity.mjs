// 봇 규칙(trader/replay.py)과 사이트 시뮬레이션(src/simulation-engine.ts)을 같은 입력으로 돌려 거래를 하나씩 대조한다.
// 비교 설정: 사이트 기본값에서 쉬는 현금 ETF·기업행사 정산을 뺀 것(봇에 아직 없는 기능).
// usage: node --experimental-strip-types scripts/trader-parity.mjs <simulation-input.json|--synthetic> [start ...]
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {runSimulation} from '../src/simulation-engine.ts';

// --synthetic: 공개 저장소·CI용 작은 가상 입력 tests/fixtures/trader-synthetic.json(비공개 자료 없음). 연기금 순매도 청산, 갭 손절·익절, 같은 날 양쪽 도달,
// 시가 단절 후 재시도, 현금 부족 대기·부분 매수, 보유 중 신호 제외, 점수 없음, 가격 단절(미확인)을 모두 지나간다.
const FIXTURE=join(dirname(new URL(import.meta.url).pathname),'..','tests','fixtures','trader-synthetic.json');
let [file,...starts]=process.argv.slice(2);
if(!file)throw Error('usage: trader-parity.mjs <simulation-input.json|--synthetic> [start ...]');
let data;
if(file==='--synthetic'){file=FIXTURE;data=JSON.parse(readFileSync(file,'utf8'));if(!starts.length)starts=[data.sessions[0]];}
else{data=JSON.parse(readFileSync(file,'utf8'));if(data.stock_files)data.stocks=data.stock_files.flatMap(f=>JSON.parse(readFileSync(join(dirname(file),f),'utf8')));}
const base={mode:'capital',initial:20e6,budget:5e6,take:30,stop:10,filter:'quiet3m-volume',flowExit:true,sizing:'percent',percent:25,minBuy:3e6,costs:{buy:0.015,sell:0.215}};
const close=(a,b,tol=0.01)=>a==null||b==null?a==b:Math.abs(a-b)<=tol;
// 변형: 기본값 + 규칙의 다른 갈래(현금 부족·부분 매수·대기, 연기금 순매도 청산, 짧은 익절/손절)를 지나가게 하는 설정.
const variants=[['기본',{},{}],['소액 계좌(현금 부족·부분 매수)',{initial:8e6},{initial:8e6}],['짧은 익절·손절',{take:10,stop:5},{take:10,stop:5}],['큰 비중(현금 부족)',{percent:60},{percent:60}],['긴 보유(연기금 매도 청산)',{take:100,stop:50},{take:100,stop:50}]];
let failed=0;
for(const start of starts.length?starts:[data.sessions[0],'2026-01-01'])for(const [label,tsOver,pyOver] of variants){
 const ts=runSimulation(data,{...base,...tsOver,start});
 const py=JSON.parse(execFileSync('python3',['-m','trader.replay',file,'--start',start,'--settings',JSON.stringify(pyOver)],{cwd:join(dirname(new URL(import.meta.url).pathname),'..'),maxBuffer:1<<28}).toString());
 const key=t=>`${t.code}:${t.signal_date}`;
 const tsMap=new Map(ts.trades.filter(t=>t.status!=='skipped'||true).map(t=>[key(t),t])),pyMap=new Map(py.trades.map(t=>[key(t),t]));
 const diffs=[];
 for(const [k,a] of tsMap){const b=pyMap.get(k);if(!b){diffs.push([k,'missing in replay',a.status]);continue;}
  const fields=[['status',a.status,b.status,(x,y)=>x===y],['entry_date',a.entry_date??null,b.entry_date,(x,y)=>x===y],['entry_price',a.entry_price??null,b.entry_price,close],['shares',a.shares??0,b.shares,(x,y)=>x===y],['invested',a.invested??0,b.invested,close],['exit_date',a.exit_date??null,b.exit_date,(x,y)=>x===y],['exit_price',a.exit_price??null,b.exit_price,close],['pnl',a.pnl??null,b.pnl,close]];
  for(const [f,x,y,eq] of fields)if(!eq(x,y))diffs.push([k,f,x,y]);}
 for(const k of pyMap.keys())if(!tsMap.has(k))diffs.push([k,'missing in simulation']);
 const lastTs=ts.ledger.at(-1),lastPy=py.ledger.at(-1);
 const counts=s=>Object.entries(s.reduce((m,t)=>(m[t.status]=(m[t.status]??0)+1,m),{})).sort().map(([k,v])=>`${k} ${v}`).join(', ');
 const eq=v=>v==null?'미확인':v.toFixed(0);
 console.log(`${label} · start ${start}: 시뮬레이션 거래 ${ts.trades.length}건(${counts(ts.trades)}), 리플레이 ${py.trades.length}건 · 최종 평가자산 ${eq(lastTs.equity)} vs ${eq(lastPy.equity)} · 현금 ${eq(lastTs.end_cash)} vs ${eq(lastPy.end_cash)} · 차이 ${diffs.length}건`);
 for(const d of diffs.slice(0,15))console.log('  ',JSON.stringify(d));
 const ledgerDiffs=ts.ledger.filter((l,j)=>!close(l.equity,py.ledger[j]?.equity,0.05)||!close(l.end_cash,py.ledger[j]?.end_cash,0.05));
 if(ledgerDiffs.length)console.log(`   일별 원장 차이 ${ledgerDiffs.length}일, 첫날 ${ledgerDiffs[0].date}`);
 failed+=diffs.length+ledgerDiffs.length;
}
if(failed){console.error('불일치 있음');process.exit(1);}
console.log('모두 일치');
