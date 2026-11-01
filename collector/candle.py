"""Signal-day candle: a reference tag only (not used by any rule or score)."""


def candle_of(row):
    """'bull' (close > open, 양봉), 'bear' (close < open, 음봉), 'flat', or None when a price is missing."""
    if not row:
        return None
    o, c = row.get('open'), row.get('close')
    if o is None or c is None or o <= 0 or c <= 0:
        return None
    return 'bull' if c > o else 'bear' if c < o else 'flat'
