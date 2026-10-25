"""Point-in-time foreign net-selling record, measured in KRW rather than shares."""
import math


def foreign_record(signal_date, foreign, sessions, lookback=20):
    result = dict(status='missing', lookback=lookback, signal_net=None,
                  prior_max_sell=None, observed_days=0)
    if signal_date not in sessions:
        return result
    index = sessions.index(signal_date)
    prior = sessions[max(0, index-lookback):index]
    def finite(value):
        return isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value)
    current = foreign.get(signal_date, {}).get('net')
    values = [foreign.get(day, {}).get('net') for day in prior]
    result.update(signal_net=current if finite(current) else None,
                  observed_days=sum(finite(value) for value in values))
    if len(prior) != lookback or not finite(current) or not all(finite(value) for value in values):
        return result
    maximum = max(0, *(-value for value in values))
    return dict(result, prior_max_sell=maximum,
                status='record' if current < 0 and -current > maximum else 'normal')
