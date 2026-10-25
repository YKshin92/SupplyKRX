"""Price barrier observations, independent of account cash and later flow filters."""
from .simulation import price_problem


def touch_outcome(signal_date, history, sessions):
    result = dict(status='pending', entry_date=None, entry_price=None,
                  first_take_date=None, first_stop_date=None, first_date=None,
                  trading_days=None, ambiguous=False, scan_complete=True,
                  take_touched=None, stop_touched=None, reason=None)
    if signal_date not in sessions:
        return dict(result, status='missing', scan_complete=False, reason='신호일 거래일 미확인')
    start = sessions.index(signal_date) + 1
    if start >= len(sessions):
        return result
    entry = history.get(sessions[start])
    problem = price_problem(history.get(signal_date), entry)
    if problem:
        return dict(result, status='missing', scan_complete=False, reason=problem)
    opening = entry['open']
    result.update(entry_date=sessions[start], entry_price=opening, status='open')
    for i in range(start, len(sessions)):
        day = sessions[i]
        row = history.get(day)
        problem = price_problem(history.get(sessions[i-1]), row)
        if problem:
            result.update(scan_complete=False, reason=f'{day} {problem}')
            if result['first_date'] is None:
                result['status'] = 'missing'
            break  # A gap can conceal an earlier touch; never claim an order across it.
        take, stop = row['high'] >= opening*1.3, row['low'] <= opening*.9
        if take and result['first_take_date'] is None:
            result['first_take_date'] = day
        if stop and result['first_stop_date'] is None:
            result['first_stop_date'] = day
        if result['first_date'] is None and (take or stop):
            # Opening gaps establish order even when the subsequent day's range crosses both.
            status = 'stop' if row['open'] <= opening*.9 else 'take' if row['open'] >= opening*1.3 else 'stop' if stop else 'take'
            result.update(status=status, first_date=day, trading_days=i-start+1,
                          ambiguous=take and stop and opening*.9 < row['open'] < opening*1.3)
    result['take_touched'] = True if result['first_take_date'] else False if result['scan_complete'] else None
    result['stop_touched'] = True if result['first_stop_date'] else False if result['scan_complete'] else None
    return result
