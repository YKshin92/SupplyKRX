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


def _series_out(series, chart_sessions):
    return [dict(date=x['date'], close=x['close'], rsi=None if x['rsi'] is None else round(x['rsi'], 2)) for x in series[-chart_sessions:]]


def _rounded(summary):
    return {k: (round(v, 2) if k in ('rsi', 'prev_rsi') and v is not None else v) for k, v in summary.items()}


def latest_caps(metadata_dir, as_of):
    """Point-in-time market caps: the newest snapshot on or before as_of. Never a later snapshot."""
    import json
    from pathlib import Path
    folder = Path(metadata_dir) if metadata_dir else None
    if not folder or not folder.exists():
        return None, {}
    days = sorted(p.stem for p in folder.glob('????-??-??.json') if p.stem <= as_of)
    if not days:
        return None, {}
    data = json.loads((folder / f'{days[-1]}.json').read_text(encoding='utf-8'))
    return days[-1], {c: v.get('market_cap') for c, v in data.get('instruments', {}).items() if v.get('market_cap')}


def us_rsi(us, chart_sessions=62, top=30):
    """US block from the private us-market.json (split-adjusted closes, US sessions from the S&P 500 series)."""
    if not us or not us.get('indices'):
        return None
    calendar = sorted(set().union(*[set(v.get('prices', {})) for v in us['indices'].values()]))
    def one(prices, require_volume):
        days = [d for d in calendar if d >= min(prices)] if prices else []
        series = cutler_series(prices, days, require_volume=require_volume)
        return _rounded(summarize(series)), _series_out(series, chart_sessions)
    indices = {}
    for name, v in us['indices'].items():
        s, series = one(v.get('prices', {}), False)
        indices[name] = dict(symbol=v.get('symbol'), summary=s, series=series)
    stocks = []
    for item in sorted(us.get('stocks', []), key=lambda x: x['rank'])[:top]:
        prices = item.get('prices', {})
        s, series = one(prices, True)
        stocks.append(dict(rank=item['rank'], symbol=item['symbol'], name=item['name'], market_cap_usd=item.get('market_cap_usd'),
                           close=series[-1]['close'] if series else None, last_date=series[-1]['date'] if series else None, series=series, **s))
    return dict(as_of=calendar[-1] if calendar else None, collected_at=us.get('collected_at'), cap_date=us.get('cap_date'),
                cap_source=us.get('cap_source'), price_source=us.get('price_source'), currency='USD',
                price_basis='분할 조정 종가(배당 미조정)', indices=indices, top30=stocks)


def publish_rsi(rows, calendar, indices, target, chart_sessions=62, metadata_dir=None, us=None, top=30):
    """rows: collector rows (pension rows carry the stock's daily OHLCV). Writes target/rsi/latest.json."""
    from .core import save_json
    pension = [r for r in rows if r['investor'] == '연기금 등']
    as_of = max(r['date'] for r in pension)
    sessions = [d for d in calendar['sessions'] if min(r['date'] for r in pension) <= d <= as_of]
    by_code = {}
    for r in pension:
        by_code.setdefault(r['code'], {})[r['date']] = r
    stocks = []
    series_by_code = {}
    for code, history in by_code.items():
        latest = history.get(as_of)
        if not latest:
            continue  # delisted or not traded on the reference date: outside the monitoring population
        series = cutler_series(history, sessions)
        series_by_code[code] = series
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
        index_out[name] = dict(summary=_rounded(summarize(series)), series=_series_out(series, chart_sessions))
    for s in stocks:
        for k in ('rsi', 'prev_rsi'):
            if s[k] is not None:
                s[k] = round(s[k], 2)
    cap_date, caps = latest_caps(metadata_dir, as_of)
    ranked = sorted((s for s in stocks if caps.get(s['code'])), key=lambda s: (-caps[s['code']], s['code']))[:top]
    domestic = dict(cap_date=cap_date, cap_source='KRX 시가총액 스냅샷(기준일 이하 최신)', items=[
        dict(rank=i + 1, market_cap=caps[s['code']], series=_series_out(series_by_code[s['code']], chart_sessions), **s) for i, s in enumerate(ranked)]) if ranked else None
    computed = [s for s in stocks if s['rsi'] is not None]
    result = dict(schema_version=1, as_of=as_of, rules=RULES, population=len(stocks), computed=len(computed),
                  below30=sum(s['state'] == 'below30' for s in computed), entries_today=sum(s['entry_today'] for s in computed),
                  missing=dict(warmup=sum(s['reason'] == 'warmup' for s in stocks), flat=sum(s['reason'] == 'flat' for s in stocks),
                               invalid=sum(s['reason'] == 'invalid' for s in stocks), break_reset=sum(s['reason'] == 'break' for s in stocks)),
                  indices=index_out, domestic_top30=domestic, us=us_rsi(us, chart_sessions, top), stocks=stocks)
    save_json(target / 'rsi' / 'latest.json', result)
    return result
