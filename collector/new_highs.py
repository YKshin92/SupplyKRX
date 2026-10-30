"""3-year new-high monitoring (monitoring only; not a signal, score or simulation input).

Prices are the adjusted (수정주가) KRX bars used for RSI: warm-up history + live rows, split/merge breaks
scaled by the exchange change rate. A bar counts only when close > 0, volume > 0 and the OHLC range is
consistent (halted days are skipped, never filled).
- prior high: the highest HIGH over the previous WINDOW sessions (today excluded).
- 신고가(장중): today's high > prior high.  신고가(종가): today's close > the highest prior CLOSE.
- near: today's close within NEAR % below the prior high.
- coverage: when fewer than WINDOW valid sessions exist (new listing, long halt, data start), the label is
  '보유 자료 기준 최고가' with the first available date — never presented as a full 3-year high.
- old_high_gap: sessions between the previous high's date and today (a breakout of an old peak vs. a
  stock that keeps making highs).
Pension context (net buying) is attached for viewing; it does not change the classification.
"""
from pathlib import Path

WINDOW = 735   # about three years of KRX sessions
NEAR = 5.0
LIST = 10.0  # published rows: new highs and stocks within 10 % of the prior high
RECENT = 20


def _valid(r):
    return bool(r and r.get('close') and r['close'] > 0 and (r.get('volume') or 0) > 0 and r.get('high') and r.get('low')
                and r['low'] <= r['close'] <= r['high'])


def classify(history, sessions, as_of, window=WINDOW):
    today_i = sessions.index(as_of) if as_of in sessions else None
    today = history.get(as_of)
    if today_i is None or not _valid(today):
        return None
    prior = [(d, history[d]) for d in sessions[max(0, today_i - window):today_i] if _valid(history.get(d))]
    if len(prior) < 20:
        return None
    hd, hr = max(prior, key=lambda x: (x[1]['high'], x[0]))
    cd, cr = max(prior, key=lambda x: (x[1]['close'], x[0]))
    first = prior[0][0]
    full = len(prior) >= window * 0.95 and first <= sessions[max(0, today_i - window)]
    distance = (today['close'] / hr['high'] - 1) * 100
    recent = 0
    for j in range(max(0, today_i - RECENT + 1), today_i + 1):
        d = sessions[j]
        r = history.get(d)
        if not _valid(r):
            continue
        before = [history[x]['high'] for x in sessions[max(0, j - window):j] if _valid(history.get(x))]
        if before and r['high'] > max(before):
            recent += 1
    return dict(close=today['close'], high=today['high'], prior_high=round(hr['high'], 2), prior_high_date=hd,
                prior_close_high=round(cr['close'], 2), distance=round(distance, 2),
                new_high=today['high'] > hr['high'], close_new_high=today['close'] > cr['close'],
                near=distance >= -NEAR, full_window=full, coverage_from=first, sessions_covered=len(prior),
                old_high_gap=today_i - sessions.index(hd), recent_new_highs=recent,
                adjusted=any(r.get('adjusted') for _, r in prior))


def publish_new_highs(rows, keep, as_of, target, rsi_stocks=None, rank_top=None):
    from .core import save_json
    sessions = [d for d in keep['sessions'] if d <= as_of]
    pension = {}
    for r in rows:
        if r['investor'] == '연기금 등' and r['date'] <= as_of and r.get('net') is not None:
            pension.setdefault(r['code'], {})[r['date']] = r['net']
    rsi = {s['code']: s for s in (rsi_stocks or [])}
    out = []
    for code, history in keep['history'].items():
        c = classify(history, sessions, as_of)
        if not c or not (c['new_high'] or c['distance'] >= -LIST):
            continue
        flows = pension.get(code, {})
        last = [flows.get(d) for d in sessions[-20:]]
        known = lambda xs: [x for x in xs if x is not None]
        out.append(dict(code=code, name=keep['names'].get(code, code), market=keep['markets'].get(code),
                        pension_net=flows.get(as_of), pension_5d=sum(known(last[-5:])) if known(last[-5:]) else None,
                        pension_20d=sum(known(last)) if known(last) else None,
                        rsi=(rsi.get(code) or {}).get('rsi'), rank_top20=bool(rank_top and code in rank_top), **c))
    out.sort(key=lambda s: (not s['new_high'], -s['distance'], s['code']))
    result = dict(schema_version=1, as_of=as_of, rules=dict(window=WINDOW, near=NEAR, listed_within=LIST, recent=RECENT,
                  price='수정주가(KRX 종가·등락률 기준 보정)', high='장중 고가 기준, 종가 신고가는 별도 표시',
                  coverage='3년치가 없으면 보유 자료 시작일 이후 최고가로 표시'),
                  population=len(keep['history']), counts=dict(new_high=sum(s['new_high'] for s in out),
                  full_new_high=sum(s['new_high'] and s['full_window'] for s in out), close_new_high=sum(s['close_new_high'] for s in out),
                  near=sum(s['near'] and not s['new_high'] for s in out), with_pension=sum(s['new_high'] and (s['pension_net'] or 0) > 0 for s in out)),
                  stocks=out)
    save_json(Path(target) / 'new-highs' / 'latest.json', result)
    return result
