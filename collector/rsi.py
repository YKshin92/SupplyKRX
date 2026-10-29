"""Cutler RSI (simple moving average of gains and losses) for monitoring only.

Differences from the earlier local research code: that code used Wilder smoothing. This module
uses Cutler's SMA, so values differ and must not be compared as the same experiment.

Rules (also published in the output so the UI can state them):
- Input is the raw daily close. A session is valid when close > 0 and, for stocks, volume > 0
  (a halted session with a carried-forward close and zero volume is not a trade).
- RSI(n) needs n consecutive close-to-close changes, i.e. n+1 consecutive valid sessions.
  A missing or zero-volume session, or a price break (corporate action or mismatched change rate,
  same rule as price_break), restarts the warm-up. Nothing is filled or adjusted.
- avg_gain = mean of positive changes, avg_loss = mean of absolute negative changes over the window.
  RSI = 100 - 100 / (1 + avg_gain / avg_loss); avg_loss == 0 < avg_gain -> 100;
  both zero (completely flat) -> no value, reason 'flat'.
- State: RSI < 30 is 'below30'. Entry event: the previous session's RSI exists and is >= 30 and
  today's RSI is < 30. Staying below 30 is a state, never a new event.
"""
from .simulation import price_break

PERIOD = 14
LOW, HIGH = 30, 70
RULES = dict(method='Cutler RSI (SMA)', period=PERIOD, low=LOW, high=HIGH, price='raw close',
             invalid='close 미수집·0, 거래량 0(거래정지 추정)', reset='결측·거래량 0·가격 단절(기업행사 포함) 다음부터 warm-up 재시작',
             flat='14일 모두 보합이면 값 없음', event='전일 RSI 30 이상 → 당일 30 미만일 때만 하향 진입 사건')


def cutler_series(rows, sessions, period=PERIOD, require_volume=True):
    """rows: date -> row with close (and volume/open/change_pct for stocks). Returns one entry per session."""
    out = []
    changes = []  # consecutive close-to-close changes since the last reset
    previous = None
    for day in sessions:
        r = rows.get(day)
        valid = bool(r and r.get('close') and r['close'] > 0 and (not require_volume or (r.get('volume') or 0) > 0))
        if not valid:
            changes, previous = [], None
            out.append(dict(date=day, close=r.get('close') if r else None, rsi=None, reason='invalid'))
            continue
        if previous is not None and price_break(previous, r):
            changes, previous = [], None
            reason = 'break'
        else:
            reason = None
        if previous is not None:
            changes.append(r['close'] - previous['close'])
            if len(changes) > period:
                changes.pop(0)
        previous = r
        if len(changes) < period:
            out.append(dict(date=day, close=r['close'], rsi=None, reason=reason or 'warmup'))
            continue
        gain = sum(c for c in changes if c > 0) / period
        loss = -sum(c for c in changes if c < 0) / period
        if gain == 0 and loss == 0:
            out.append(dict(date=day, close=r['close'], rsi=None, reason='flat'))
        elif loss == 0:
            out.append(dict(date=day, close=r['close'], rsi=100.0, reason=None))
        else:
            out.append(dict(date=day, close=r['close'], rsi=100 - 100 / (1 + gain / loss), reason=None))
    return out


def summarize(series):
    """Latest state, today's entry event, consecutive sessions below 30 and the last entry date."""
    last = series[-1] if series else None
    prev = series[-2] if len(series) > 1 else None
    rsi = last['rsi'] if last else None
    entry = bool(rsi is not None and rsi < LOW and prev and prev['rsi'] is not None and prev['rsi'] >= LOW)
    streak = 0
    for s in reversed(series):
        if s['rsi'] is not None and s['rsi'] < LOW:
            streak += 1
        else:
            break
    last_entry = None
    for a, b in zip(series, series[1:]):
        if a['rsi'] is not None and b['rsi'] is not None and a['rsi'] >= LOW and b['rsi'] < LOW:
            last_entry = b['date']
    state = None if rsi is None else 'below30' if rsi < LOW else 'above70' if rsi >= HIGH else 'neutral'
    return dict(rsi=rsi, prev_rsi=prev['rsi'] if prev else None, state=state, entry_today=entry,
                below_streak=streak, last_entry_date=last_entry, reason=last['reason'] if last else 'missing')


def publish_rsi(rows, calendar, indices, target, chart_sessions=62):
    """rows: collector rows (pension rows carry the stock's daily OHLCV). Writes target/rsi/latest.json."""
    from .core import save_json
    pension = [r for r in rows if r['investor'] == '연기금 등']
    as_of = max(r['date'] for r in pension)
    sessions = [d for d in calendar['sessions'] if min(r['date'] for r in pension) <= d <= as_of]
    by_code = {}
    for r in pension:
        by_code.setdefault(r['code'], {})[r['date']] = r
    stocks = []
    for code, history in by_code.items():
        latest = history.get(as_of)
        if not latest:
            continue  # delisted or not traded on the reference date: outside the monitoring population
        series = cutler_series(history, sessions)
        s = summarize(series)
        stocks.append(dict(code=code, name=latest['name'], market=latest['market'], close=latest.get('close'),
                           change_pct=latest.get('change_pct'), observed=sum(1 for x in series if x['rsi'] is not None), **s))
    stocks.sort(key=lambda x: (x['rsi'] is None, x['rsi'] if x['rsi'] is not None else 0, x['code']))
    index_out = {}
    for name, value in (indices or {}).get('indices', {}).items():
        prices = value.get('prices', {})
        if not prices:
            continue
        days = [d for d in calendar['sessions'] if min(prices) <= d <= min(max(prices), as_of)]
        series = cutler_series(prices, days, require_volume=False)
        index_out[name] = dict(summary=summarize(series), series=[dict(date=x['date'], close=x['close'], rsi=None if x['rsi'] is None else round(x['rsi'], 2)) for x in series[-chart_sessions:]])
    for s in stocks:
        for k in ('rsi', 'prev_rsi'):
            if s[k] is not None:
                s[k] = round(s[k], 2)
    computed = [s for s in stocks if s['rsi'] is not None]
    result = dict(schema_version=1, as_of=as_of, rules=RULES, population=len(stocks), computed=len(computed),
                  below30=sum(s['state'] == 'below30' for s in computed), entries_today=sum(s['entry_today'] for s in computed),
                  missing=dict(warmup=sum(s['reason'] == 'warmup' for s in stocks), flat=sum(s['reason'] == 'flat' for s in stocks),
                               invalid=sum(s['reason'] == 'invalid' for s in stocks), break_reset=sum(s['reason'] == 'break' for s in stocks)),
                  indices=index_out, stocks=stocks)
    save_json(target / 'rsi' / 'latest.json', result)
    return result
