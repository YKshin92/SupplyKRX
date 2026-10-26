"""Do not compare unadjusted prices across unknown quotes/corporate actions."""
import math
from .simulation import price_problem


def price_comparison(signal_date, history, sessions):
    def blocked(day, reason):
        return dict(status='blocked', date=day, reason=reason)
    if signal_date not in sessions:
        return blocked(signal_date, '신호일 자료 미확인')
    start = sessions.index(signal_date)
    opening = history.get(signal_date, {}).get('close')
    if opening is None or not math.isfinite(opening) or opening <= 0:
        return blocked(signal_date, '신호일 종가 미확인')
    for i in range(start + 1, len(sessions)):
        reason = price_problem(history.get(sessions[i-1]), history.get(sessions[i]))
        if reason:
            return blocked(sessions[i], reason)
    return dict(status='comparable', date=None, reason=None)
