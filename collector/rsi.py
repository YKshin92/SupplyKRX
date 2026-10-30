"""RSI(14) for monitoring only. Main value: Wilder smoothing (the HTS/MTS standard). Cutler (SMA) is kept as a secondary value.

Wilder: the first value is the simple mean of the first 14 changes after a (re)start; afterwards
avg = (prev_avg * 13 + today) / 14. The value depends on where the series starts, so longer warm-up
history (rsi-warmup) is merged in front of the live rows when available. Cutler uses the plain mean of
the last 14 changes and does not depend on the start.

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
RULES = dict(method='Wilder RSI (표준, HTS/MTS 기본값)', secondary='Cutler RSI (단순평균)', period=PERIOD, low=LOW, high=HIGH, price='raw close',
             invalid='close 미수집·0, 거래량 0(거래정지 추정)', reset='결측·거래량 0·가격 단절(기업행사 포함) 다음부터 warm-up 재시작',
             flat='14일 모두 보합이면 값 없음', event='전일 RSI 30 이상 → 당일 30 미만일 때만 하향 진입 사건')


def _value(gain, loss):
    if gain == 0 and loss == 0:
        return None
    return 100.0 if loss == 0 else 100 - 100 / (1 + gain / loss)


def cutler_series(rows, sessions, period=PERIOD, require_volume=True):
    """rows: date -> row with close (and volume/open/change_pct for stocks). One entry per session.
    rsi = Wilder (main), cutler = Cutler SMA, since_reset = changes accumulated since the last restart."""
    out = []
    changes = []  # last `period` changes since the last reset (for the seed and Cutler)
    previous = None
    wg = wl = None  # Wilder running averages
    count = 0
    for day in sessions:
        r = rows.get(day)
        valid = bool(r and r.get('close') and r['close'] > 0 and (not require_volume or (r.get('volume') or 0) > 0))
        if not valid:
            changes, previous, wg, wl, count = [], None, None, None, 0
            out.append(dict(date=day, close=r.get('close') if r else None, rsi=None, cutler=None, since_reset=0, reason='invalid'))
            continue
        reason = None
        if previous is not None and price_break(previous, r):
            changes, previous, wg, wl, count = [], None, None, None, 0
            reason = 'break'
        if previous is not None:
            c = r['close'] - previous['close']
            changes.append(c)
            count += 1
            if len(changes) > period:
                changes.pop(0)
            if wg is not None:
                wg = (wg * (period - 1) + max(c, 0)) / period
                wl = (wl * (period - 1) + max(-c, 0)) / period
            elif count == period:
                wg = sum(x for x in changes if x > 0) / period
                wl = -sum(x for x in changes if x < 0) / period
        previous = r
        if count < period:
            out.append(dict(date=day, close=r['close'], rsi=None, cutler=None, since_reset=count, reason=reason or 'warmup'))
            continue
        cutler = _value(sum(x for x in changes if x > 0) / period, -sum(x for x in changes if x < 0) / period)
        wilder = _value(wg, wl)
        out.append(dict(date=day, close=r['close'], rsi=wilder, cutler=cutler, since_reset=count, reason=None if wilder is not None else 'flat'))
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
                below_streak=streak, last_entry_date=last_entry, reason=last['reason'] if last else 'missing',
                cutler=last.get('cutler') if last else None, since_reset=last.get('since_reset', 0) if last else 0)


def _r(v):
    return None if v is None else round(v, 2)


def _series_out(series, chart_sessions):
    return [dict(date=x['date'], close=x['close'], rsi=_r(x['rsi']), cutler=_r(x.get('cutler'))) for x in series[-chart_sessions:]]


def _series_ohlcv(series, prices, chart_sessions):
    """Chart rows for the stock detail: OHLCV from the source rows next to the RSI values. Missing stays None."""
    out = []
    for x in _series_out(series, chart_sessions):
        r = prices.get(x['date']) or {}
        rd = lambda v: None if v is None else round(v, 4)
        out.append(dict(x, open=rd(r.get('open')), high=rd(r.get('high')), low=rd(r.get('low')), volume=r.get('volume')))
    return out


def _rounded(summary):
    return {k: (round(v, 2) if k in ('rsi', 'prev_rsi', 'cutler') and v is not None else v) for k, v in summary.items()}


def load_warmup(path):
    """Optional older closes merged in front of the live rows: {sessions, stocks:{code:[[close, volume]|null,...]}}."""
    import gzip, json
    from pathlib import Path
    p = Path(path) if path else None
    if not p or not p.exists():
        return [], {}
    data = json.loads(gzip.decompress(p.read_bytes()).decode('utf-8'))
    sessions = data['sessions']
    out = {}
    for code, values in data['stocks'].items():
        if data.get('schema_version') == 2:
            out[code] = {d: dict(open=v[0], high=v[1], low=v[2], close=v[3], volume=v[4]) for d, v in zip(sessions, values) if v}
        else:
            out[code] = {d: dict(close=v[0], volume=v[1]) for d, v in zip(sessions, values) if v}
    return sessions, out


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
        full = cutler_series(prices, [d for d in calendar if d >= min(prices)] if prices else [], require_volume=True)
        stocks.append(dict(rank=item['rank'], symbol=item['symbol'], name=item['name'], market_cap_usd=item.get('market_cap_usd'),
                           close=series[-1]['close'] if series else None, last_date=series[-1]['date'] if series else None, series=_series_ohlcv(full, prices, chart_sessions), **s))
    return dict(as_of=calendar[-1] if calendar else None, collected_at=us.get('collected_at'), cap_date=us.get('cap_date'),
                cap_source=us.get('cap_source'), price_source=us.get('price_source'), currency='USD',
                price_basis='분할 조정 종가(배당 미조정)', indices=indices, top30=stocks)


def publish_rsi(rows, calendar, indices, target, chart_sessions=62, metadata_dir=None, us=None, top=30, warmup=None, keep=None):
    """rows: collector rows (pension rows carry the stock's daily OHLCV). Writes target/rsi/latest.json."""
    from .core import save_json
    pension = [r for r in rows if r['investor'] == '연기금 등']
    as_of = max(r['date'] for r in pension)
    first_live = min(r['date'] for r in pension)
    warm_sessions, warm = load_warmup(warmup)
    warm_sessions = [d for d in warm_sessions if d < first_live]
    krx_days = sorted((indices or {}).get('indices', {}).get('KOSPI', {}).get('prices', {}))
    after = next((d for d in krx_days if warm_sessions and d > warm_sessions[-1]), None)
    warmup_status = 'none' if not warm_sessions else 'joined' if after == first_live else 'gap'
    if warmup_status == 'gap':  # a missing stretch between warm-up and live rows would fake consecutive changes
        warm_sessions, warm = [], {}
    sessions = warm_sessions + [d for d in calendar['sessions'] if first_live <= d <= as_of]
    by_code = {}
    for r in pension:
        by_code.setdefault(r['code'], {})[r['date']] = r
    for code, history in by_code.items():
        for d, w in warm.get(code, {}).items():
            if d < first_live:
                history.setdefault(d, w)
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
        days = sorted(d for d in prices if d <= as_of)
        series = cutler_series(prices, days, require_volume=False)
        index_out[name] = dict(summary=_rounded(summarize(series)), series=_series_out(series, chart_sessions))
    for s in stocks:
        for k in ('rsi', 'prev_rsi', 'cutler'):
            if s[k] is not None:
                s[k] = round(s[k], 2)
    cap_date, caps = latest_caps(metadata_dir, as_of)
    ranked = sorted((s for s in stocks if caps.get(s['code'])), key=lambda s: (-caps[s['code']], s['code']))[:top]
    domestic = dict(cap_date=cap_date, cap_source='KRX 시가총액 스냅샷(기준일 이하 최신)', items=[
        dict(rank=i + 1, market_cap=caps[s['code']], series=_series_ohlcv(series_by_code[s['code']], by_code[s['code']], chart_sessions), **s) for i, s in enumerate(ranked)]) if ranked else None
    computed = [s for s in stocks if s['rsi'] is not None]
    result = dict(schema_version=1, as_of=as_of, rules=RULES, warmup_from=sessions[0] if sessions else None, warmup_status=warmup_status, population=len(stocks), computed=len(computed),
                  below30=sum(s['state'] == 'below30' for s in computed), entries_today=sum(s['entry_today'] for s in computed),
                  missing=dict(warmup=sum(s['reason'] == 'warmup' for s in stocks), flat=sum(s['reason'] == 'flat' for s in stocks),
                               invalid=sum(s['reason'] == 'invalid' for s in stocks), break_reset=sum(s['reason'] == 'break' for s in stocks)),
                  indices=index_out, domestic_top30=domestic, us=us_rsi(us, chart_sessions, top), stocks=stocks)
    save_json(target / 'rsi' / 'latest.json', result)
    if keep is not None:  # full series for the signal lab (not published)
        keep.update(history=by_code, series=series_by_code, sessions=sessions,
                    names={s['code']: s['name'] for s in stocks}, markets={s['code']: s['market'] for s in stocks})
    # Per-stock RSI path for the stock detail panel (last chart_sessions sessions, Wilder + Cutler reference).
    for code, series in series_by_code.items():
        if by_code[code].get(as_of):
            save_json(target / 'rsi' / 'stocks' / f'{code}.json', dict(schema_version=1, code=code, as_of=as_of, series=[
                dict(date=x['date'], rsi=_r(x['rsi']), cutler=_r(x.get('cutler'))) for x in series[-chart_sessions:]]))
    return result
