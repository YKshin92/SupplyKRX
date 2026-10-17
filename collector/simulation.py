"""Local, gross-price backtest. No orders, credentials or network access."""
from __future__ import annotations
from collections import Counter, defaultdict
from datetime import date
import math
from statistics import mean, median

PRICE_FIELDS = ('open', 'high', 'low', 'close')


def simulation_start(sessions, requested=None):
    """Keep pre-start data as warm-up; move a holiday to the next known session."""
    requested=requested or sessions[0]
    if not isinstance(requested,str) or len(requested)!=10 or date.fromisoformat(requested).isoformat()!=requested:
        raise ValueError('시작일은 YYYY-MM-DD 형식이어야 합니다.')
    if not sessions[0]<=requested<=sessions[-1]:
        raise ValueError('시작일은 보유 데이터 기간 안에서 선택해 주세요.')
    return next(d for d in sessions if d>=requested)


def first_signals(histories, sessions, lookback=10, quiet_cap=100_000_000, minimum=300_000_000, start_date=None):
    """Match tracking registrations, before any future-sale or recency UI filter."""
    result = []
    start=simulation_start(sessions,start_date)
    for code, history in sorted(histories.items()):
        for i in range(lookback, len(sessions)):
            if sessions[i]<start: continue
            signal = history.get(sessions[i])
            before = [history.get(d) for d in sessions[i-lookback:i]]
            if not signal or signal.get('net') is None or signal['net'] < minimum:
                continue
            if any(not r or any(r.get(k) is None or not 0 <= r[k] < quiet_cap for k in ('buy', 'sell')) for r in before):
                continue
            result.append(dict(code=code, name=signal['name'], market=signal['market'],
                signal_date=signal['date'], signal_net=signal['net'], signal_index=i,
                prior_absent_days=sum(r.get('flow_status') == 'absent_zero' for r in before)))
            break
    return sorted(result, key=lambda r: (r['signal_date'], r['code']))


def valid_price(row):
    return bool(row and all(row.get(k) is not None and row[k] > 0 for k in PRICE_FIELDS)
        and row.get('volume') is not None and row['volume'] > 0
        and row['low'] <= min(row['open'], row['close']) <= max(row['open'], row['close']) <= row['high'])


def price_break(previous, row):
    if not previous or not previous.get('close') or not row or not row.get('close'):
        return False
    change = (row['close'] / previous['close'] - 1) * 100
    opening = (row['open'] / previous['close'] - 1) * 100 if row.get('open') else 0
    return abs(change) > 35 or abs(opening) > 35 or (row.get('change_pct') is not None and abs(change-row['change_pct']) > 5)


def price_problem(previous, row):
    if not row or any(row.get(k) is None for k in PRICE_FIELDS):
        return '일봉 가격 미수집'
    if row.get('volume') is None:
        return '거래량 미수집'
    if row.get('volume') == 0:
        return '거래량 0 · 체결 가능 여부 미확인'
    if not valid_price(row):
        return '일봉 가격 범위 미확인'
    if price_break(previous, row):
        return '가격 단절 · 기업행사 확인 필요'
    return None


def trade(signal, history, sessions, budget, take, stop, ambiguous='stop'):
    out = dict(signal, budget=budget, status='pending', reason='다음 거래일이 아직 없음', entry_date=None,
        entry_price=None, shares=0, invested=0, cash=budget, exit_date=None, exit_price=None,
        pnl=None, return_pct=None, trading_days=None, calendar_days=None, ambiguous=False, path=[])
    start = signal['signal_index'] + 1
    if start >= len(sessions):
        return out
    entry = history.get(sessions[start])
    problem = price_problem(history.get(signal['signal_date']), entry)
    if problem:
        return dict(out, status='excluded', reason='다음 거래일 '+problem)
    shares = math.floor(budget / entry['open'])
    if shares == 0:
        return dict(out, status='excluded', reason='1주 가격이 투자 예산 초과')
    invested = shares * entry['open']
    out.update(entry_date=entry['date'], entry_price=entry['open'], shares=shares, invested=invested,
        cash=budget-invested, status='open', reason='최신 종가 평가')
    upper, lower = entry['open'] * (1 + take/100), entry['open'] * (1-stop/100)
    previous = history.get(signal['signal_date'])
    for index in range(start, len(sessions)):
        row = history.get(sessions[index])
        problem = price_problem(previous, row)
        if problem:
            out.update(status='unresolved', reason=f'{sessions[index]} {problem}', exit_date=None, exit_price=None)
            return out
        price, status, reason = row['close'], 'open', '최신 종가 평가'
        both = row['high'] >= upper and row['low'] <= lower
        # Open is observed before high/low. A gap through a stop can lose more than the threshold.
        if row['open'] <= lower:
            price, status, reason = row['open'], 'stop', '손절선 아래 갭 시가 청산'
        elif row['open'] >= upper:
            price, status, reason = row['open'], 'take', '익절선 위 갭 시가 청산'
        elif both:
            out['ambiguous'] = True
            price, status, reason = (lower, 'stop', '같은 날 양쪽 도달 · 손절 우선') if ambiguous == 'stop' else (upper, 'take', '같은 날 양쪽 도달 · 익절 우선')
        elif row['low'] <= lower:
            price, status, reason = lower, 'stop', '장중 손절선 도달'
        elif row['high'] >= upper:
            price, status, reason = upper, 'take', '장중 익절선 도달'
        out['path'].append(dict(date=row['date'], value=round(shares*(price-entry['open']), 4)))
        if status != 'open' or index == len(sessions)-1:
            out.update(status=status, reason=reason, exit_date=row['date'], exit_price=price,
                pnl=round(shares*(price-entry['open']), 4), return_pct=(price/entry['open']-1)*100,
                trading_days=index-start+1, calendar_days=(date.fromisoformat(row['date'])-date.fromisoformat(entry['date'])).days)
            return out
        previous = row
    return out


def summarize(trades):
    bought = [t for t in trades if t['invested'] > 0]
    priced = [t for t in bought if t['pnl'] is not None]
    realized = [t for t in priced if t['status'] in ('take', 'stop')]
    unrealized = [t for t in priced if t['status'] == 'open']
    counts = Counter(t['status'] for t in trades)
    stats = {}
    for status in ('take', 'stop'):
        subset = [t for t in priced if t['status'] == status]
        stats[status] = dict(count=len(subset), mean_trading_days=mean(t['trading_days'] for t in subset) if subset else None,
            median_trading_days=median(t['trading_days'] for t in subset) if subset else None,
            mean_calendar_days=mean(t['calendar_days'] for t in subset) if subset else None)
    total = sum(t['pnl'] for t in priced)
    coverage_capital = sum(t['invested'] for t in priced)
    return dict(signals=len(trades), bought=len(bought), counts=dict(counts), allocated=sum(t['budget'] for t in bought),
        invested=sum(t['invested'] for t in bought), idle_cash=sum(t['cash'] for t in bought),
        priced_invested=coverage_capital, unknown_invested=sum(t['invested'] for t in bought if t['pnl'] is None),
        gains=sum(max(0,t['pnl']) for t in priced), losses=-sum(min(0,t['pnl']) for t in priced),
        realized_pnl=sum(t['pnl'] for t in realized), unrealized_pnl=sum(t['pnl'] for t in unrealized), pnl=total,
        return_pct=total/coverage_capital*100 if coverage_capital else None,
        ambiguous=sum(t['ambiguous'] for t in trades), duration=stats,
        realized_losses=-sum(min(0,t['pnl']) for t in realized), unrealized_losses=-sum(min(0,t['pnl']) for t in unrealized))


def simulate(histories, sessions, *, budget=5_000_000, take=30, stop=10, start_date=None):
    start=simulation_start(sessions,start_date)
    signals = first_signals(histories, sessions, start_date=start)
    trades = [trade(s, histories[s['code']], sessions, budget, take, stop) for s in signals]
    alternative = [trade(s, histories[s['code']], sessions, budget, take, stop, 'take') for s in signals]
    curve = []
    for d in sessions:
        if d<start: continue
        value, known, unknown, active, capital = 0, 0, 0, 0, 0
        for t in trades:
            if not t['entry_date'] or t['entry_date'] > d:
                continue
            capital += t['invested']
            points = {p['date']:p['value'] for p in t['path']}
            if t['status'] in ('take','stop') and t['exit_date'] <= d:
                value += t['pnl']; known += 1
            elif d in points:
                value += points[d]; known += 1; active += 1
            else:
                unknown += 1; active += 1
        curve.append(dict(date=d, pnl=round(value,4), known=known, unknown=unknown, active=active, invested=capital))
    grouped = []
    for month in sorted({t['signal_date'][:7] for t in trades}):
        grouped.append(dict(month=month, **summarize([t for t in trades if t['signal_date'].startswith(month)])))
    return dict(as_of=sessions[-1], first_date=start, data_first_date=sessions[0],sessions=sum(d>=start for d in sessions),
        settings=dict(budget=budget,take=take,stop=stop,lookback=10,quiet_cap=100_000_000,minimum_net=300_000_000,start_date=start_date or sessions[0]),
        summary=summarize(trades), sensitivity=summarize(alternative), curve=curve, cohorts=grouped,
        trades=[{k:v for k,v in t.items() if k not in ('path','signal_index')} for t in trades])


def load_histories(directory, include_foreign=False):
    """Read private collector CSVs, retaining explicit absent-zero semantics."""
    from pathlib import Path
    import json
    from .core import read_csv, fill_legacy_absent_flows
    from .simulation_prices import supplement
    repair_path=Path(directory).parent/'simulation-price-overrides.json'
    repairs=json.loads(repair_path.read_text(encoding='utf-8')).get('quotes',{}) if repair_path.exists() else {}
    histories = defaultdict(dict)
    foreign = defaultdict(dict)
    duplicates = 0
    for path in sorted(Path(directory).glob('*.csv')):
        for row in fill_legacy_absent_flows(read_csv(path)):
            row=supplement(row,repairs.get(row['code']+':'+row['date']))
            if include_foreign and row['investor'] == '외국인':
                foreign[row['code']][row['date']] = row
            if row['investor'] == '연기금 등':
                duplicates += row['date'] in histories[row['code']]
                histories[row['code']][row['date']] = row
    if duplicates:
        raise ValueError(f'중복 연기금 일자 {duplicates}건: 데이터 확인 필요')
    return (histories, foreign) if include_foreign else histories
