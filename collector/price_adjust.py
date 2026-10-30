"""Adjusted prices (수정주가) from the exchange change rate, the way HTS charts show them.

KRX reports each day's change rate against the base price (기준가). After a split, reverse split,
bonus issue or similar action the base price is the previous close adjusted for the action, so
  base = close / (1 + change_pct/100),  factor = base / previous close.
When the actual close-to-close change differs from the reported change rate by more than THRESHOLD
percentage points, every earlier price is multiplied by that factor (and volume divided), so the series
is continuous. Small differences (ex-dividend, rounding) are left alone. Without a change rate nothing
is adjusted, and the original break handling (warm-up restart) still applies.
"""
THRESHOLD = 5.0
PRICE_KEYS = ('open', 'high', 'low', 'close')


def adjustment_points(history, sessions):
    """[(date, factor)] where an action-like break is explained by the exchange change rate."""
    out = []
    previous = None
    for day in sessions:
        r = history.get(day)
        if not r or not r.get('close') or r['close'] <= 0:
            previous = None
            continue
        if previous and r.get('change_pct') is not None:
            actual = (r['close'] / previous['close'] - 1) * 100
            if abs(actual - r['change_pct']) > THRESHOLD and r['change_pct'] > -100:
                base = r['close'] / (1 + r['change_pct'] / 100)
                factor = base / previous['close']
                if factor > 0:
                    out.append((day, factor))
        previous = r
    return out


def adjust_history(history, sessions):
    """Copy of `history` with prices before each adjustment point scaled; rows keep 'adjusted' factors."""
    points = adjustment_points(history, sessions)
    if not points:
        return history, []
    out = {}
    order = [d for d in sessions if d in history]
    cumulative = 1.0
    pending = sorted(points, reverse=True)
    for day in reversed(order):
        r = history[day]
        if cumulative != 1.0:
            r = dict(r)
            for k in PRICE_KEYS:
                if r.get(k) is not None:
                    r[k] = r[k] * cumulative
            if r.get('volume') is not None:
                r['volume'] = r['volume'] / cumulative
            r['adjusted'] = cumulative
        out[day] = r
        while pending and pending[0][0] == day:
            cumulative *= pending.pop(0)[1]
    for d, r in history.items():
        out.setdefault(d, r)
    return out, points
