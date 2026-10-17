"""Finite-cash, score-prioritized queue. All entries precede same-day exits."""
from datetime import date
import math
from .simulation import first_signals, price_problem, summarize, simulation_start
from .simulation_benchmark import index_price, add_benchmark


def entry_score(pension, foreign):
    def flow(row, maximum):
        buy, net = row.get('buy'), row.get('net')
        if buy is None or net is None or not math.isfinite(buy) or not math.isfinite(net) or buy < 0:
            return None
        if buy == 0: return 0
        return maximum * min(1,max(0,math.log1p(buy/1e8)/math.log1p(30))) * min(1,max(0,net/buy))
    p, f = flow(pension,35),flow(foreign,15)
    return dict(total=math.floor((p+f)*2+.5) if p is not None and f is not None else None,
        pension=p,foreign=f,version='signal-flow-v1',max_pension=35,max_foreign=15,
        note='신호일 수급 점수 50점을 100점 환산 · 최신 시총 제외')


def simulate_portfolio(histories, foreign, sessions, indices, *, initial=20_000_000,budget=3_000_000,take=15,stop=10,start_date=None):
    start=simulation_start(sessions,start_date)
    signals=first_signals(histories,sessions,start_date=start)
    trades=[]
    for signal in signals:
        score=entry_score(histories[signal['code']][signal['signal_date']],foreign.get(signal['code'],{}).get(signal['signal_date'],{}))
        trades.append(dict(signal,budget=budget,score=score['total'],score_parts=score,
            status='pending' if score['total'] is not None else 'score_missing',reason='다음 거래일 매수 대기' if score['total'] is not None else '신호일 수급 점수 자료 부족',
            entry_date=None,entry_price=None,shares=0,invested=0,cash=budget,
            exit_date=None,exit_price=None,pnl=None,return_pct=None,trading_days=None,calendar_days=None,
            ambiguous=False,wait_days=0,attempts=0,funding_blocks=0,path=[]))
    cash=initial;ledger=[];actions=[];equity_curve=[];max_holdings=0;min_cash=initial
    benchmark_start=None; benchmark_open=None
    kospi=indices.get('indices',{}).get('KOSPI',{}).get('prices',{})
    peak_queued=0
    for i,day in enumerate(sessions):
        if day<start: continue
        morning_cash=cash
        pending=sorted([t for t in trades if t['status']=='pending' and t['signal_index']<i],
            key=lambda t:(-t['score'],t['signal_date'],t['code']))
        buys=0;buy_count=0;sells=0;sell_count=0
        for t in pending:
            row=histories[t['code']].get(day)
            t['attempts']+=1;t['wait_days']=i-t['signal_index']-1
            # At the opening auction neither today's high/low/close nor its full-day volume is known.
            opening=row.get('open') if row else None
            previous=histories[t['code']].get(sessions[i-1]) if i else None
            previous_close=previous.get('close') if previous else None
            if not opening or not math.isfinite(opening) or opening <= 0:
                t['reason']='시가 미확인 · 다음 거래일 재검토';continue
            if previous_close and abs(opening/previous_close-1)>0.35:
                t['reason']='시가 단절 · 다음 거래일 재검토';continue
            shares=math.floor(budget/opening);cost=shares*opening
            if shares==0:
                t['reason']='1주 가격이 매수 한도 초과 · 대기';continue
            if cost>cash+1e-7:
                t['funding_blocks']+=1;t['reason']='현금 부족 · 매도 대금 재사용 대기';continue
            before=cash;cash-=cost;buys+=cost;buy_count+=1
            t.update(status='open',reason='최신 종가 평가',entry_date=day,entry_price=opening,shares=shares,
                invested=cost,cash=budget-cost,actual_entry_index=i)
            actions.append(dict(date=day,action='buy',code=t['code'],name=t['name'],score=t['score'],price=opening,
                shares=shares,value=cost,cash_before=before,cash_after=cash,wait_days=t['wait_days']))
            if benchmark_start is None:
                benchmark_start=day;benchmark_open=index_price(kospi.get(day),'open')
        min_cash=min(min_cash,cash)
        holding_before_exits=[t for t in trades if t['status'] in ('open','unresolved') and t['entry_date']]
        max_holdings=max(max_holdings,len(holding_before_exits))
        for t in trades:
            if t['status']!='open': continue
            row=histories[t['code']].get(day)
            previous=histories[t['code']].get(sessions[i-1]) if i else None
            problem=price_problem(previous,row)
            if problem:
                t.update(status='unresolved',reason=f'{day} {problem} · 자금 회수 미확인',pnl=None,return_pct=None,exit_date=None,exit_price=None)
                continue
            upper=t['entry_price']*(1+take/100);lower=t['entry_price']*(1-stop/100)
            price=row['close'];status='open';reason='최신 종가 평가'
            if row['open']<=lower: price,status,reason=row['open'],'stop','손절선 아래 갭 시가 청산'
            elif row['open']>=upper: price,status,reason=row['open'],'take','익절선 위 갭 시가 청산'
            elif row['high']>=upper and row['low']<=lower:
                t['ambiguous']=True;price,status,reason=lower,'stop','같은 날 양쪽 도달 · 손절 우선'
            elif row['low']<=lower: price,status,reason=lower,'stop','장중 손절선 도달'
            elif row['high']>=upper: price,status,reason=upper,'take','장중 익절선 도달'
            pnl=round(t['shares']*(price-t['entry_price']),4)
            t['path'].append(dict(date=day,value=pnl))
            t.update(status=status,reason=reason,exit_date=day,exit_price=price,pnl=pnl,
                return_pct=(price/t['entry_price']-1)*100,trading_days=i-t['actual_entry_index']+1,
                calendar_days=(date.fromisoformat(day)-date.fromisoformat(t['entry_date'])).days)
            if status in ('take','stop'):
                proceeds=t['invested']+pnl;before=cash;cash+=proceeds;sells+=proceeds;sell_count+=1
                actions.append(dict(date=day,action='sell',code=t['code'],name=t['name'],score=t['score'],price=price,
                    shares=t['shares'],value=proceeds,pnl=pnl,cash_before=before,cash_after=cash))
        active=[t for t in trades if t['status'] in ('open','unresolved') and t['entry_date']]
        unknown=[t for t in active if t['status']=='unresolved']
        known_value=sum(t['invested']+t['pnl'] for t in active if t['status']=='open')
        nav=cash+known_value if not unknown else None
        close=index_price(kospi.get(day),'close')
        reference=initial*(close/benchmark_open-1) if benchmark_start and benchmark_open and close else 0 if benchmark_start is None else None
        queued=sum(t['status']=='pending' and t['signal_index']<i for t in trades)
        peak_queued=max(peak_queued,queued)
        ledger.append(dict(date=day,morning_cash=morning_cash,buy_value=buys,buy_count=buy_count,sale_proceeds=sells,
            sell_count=sell_count,after_buys_cash=morning_cash-buys,end_cash=cash,holdings=len(active),
            waiting=queued,equity=nav,known_assets=cash+known_value,unknown_cost=sum(t['invested'] for t in unknown)))
        equity_curve.append(dict(date=day,strategy_pnl=nav-initial if nav is not None else None,
            benchmark_pnl=reference,missing=len(unknown),count=sum(t['invested']>0 for t in trades)))
        assert cash>=-1e-6, 'Negative cash / implicit borrowing'
    base_summary=summarize(trades)
    months=sorted({t['signal_date'][:7] for t in trades})
    result=dict(as_of=sessions[-1],first_date=start,data_first_date=sessions[0],sessions=sum(d>=start for d in sessions),
        settings=dict(mode='capital',initial=initial,budget=budget,take=take,stop=stop,lookback=10,quiet_cap=100_000_000,minimum_net=300_000_000,start_date=start_date or sessions[0]),
        summary=base_summary,cohorts=[dict(month=m,**summarize([t for t in trades if t['signal_date'].startswith(m)])) for m in months],
        trades=[{k:v for k,v in t.items() if k not in ('path','actual_entry_index')} for t in trades],curve=[],
        account=dict(initial=initial,cash=cash,equity=ledger[-1]['equity'],known_assets=ledger[-1]['known_assets'],
            pnl=ledger[-1]['equity']-initial if ledger[-1]['equity'] is not None else None,
            return_pct=(ledger[-1]['equity']/initial-1)*100 if ledger[-1]['equity'] is not None else None,
            unknown_cost=ledger[-1]['unknown_cost'],holdings=ledger[-1]['holdings'],waiting=ledger[-1]['waiting'],
            peak_waiting=peak_queued,max_holdings=max_holdings,min_cash=min_cash,
            delayed_buys=sum(t['invested']>0 and t['wait_days']>0 for t in trades),
            score_missing=sum(t['status']=='score_missing' for t in trades),ledger=ledger,actions=actions,
            score_note='신호일 연기금 35점 + 외국인 15점을 100점 환산 · 현재 시총 제외 · 점수 고정',
            queue_note='미매수 최초 신호를 만료 없이 보관 · 신규/대기 통합 점수순 · 동점은 오래된 신호/코드순 · 당일 매도 대금은 다음 거래일부터 사용'))
    # Fixed-horizon selection analysis still uses actual entry dates. The cash-limited
    # portfolio benchmark must not pretend that recycled stock proceeds are new deposits.
    add_benchmark(result,histories,sessions,indices,'kospi')
    b=result['benchmark'];reference=equity_curve[-1]['benchmark_pnl'];nav=ledger[-1]['equity']
    b.update(label='KOSPI',mode='capital',allocated=initial,invested=initial if benchmark_start else 0,idle_cash=0 if benchmark_start else initial,
        strategy_pnl=nav-initial if nav is not None else None,index_pnl=reference,
        extra_pnl=(nav-initial)-reference if nav is not None and reference is not None else None,
        strategy_return=(nav/initial-1)*100 if nav is not None else None,
        index_return=reference/initial*100 if reference is not None else None,
        excess_pp=((nav-initial)-reference)/initial*100 if nav is not None and reference is not None else None,
        curve=equity_curve,start_date=benchmark_start,count=base_summary['bought'],excluded=[])
    return result
