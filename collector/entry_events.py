"""Observed pension re-entry episodes; private/local build output only."""
from collections import defaultdict
from .core import save_json


def build_entry_events(rows, calendar, lookback=10):
    pension = [r for r in rows if r['investor'] == '연기금 등']
    as_of = max(r['date'] for r in pension)
    first = min(r['date'] for r in pension)
    sessions = [d for d in calendar['sessions'] if first <= d <= as_of]
    histories = defaultdict(dict)
    for row in pension:
        histories[row['code']][row['date']] = row
    def price_return(start, end):
        return (end / start - 1) * 100 if start and end and start > 0 and end > 0 else None
    events = []
    for code, history in histories.items():
        series = [history.get(d) for d in sessions]
        latest = series[-1]
        for i in range(lookback, len(sessions)):
            signal = series[i]
            prior = series[i-lookback:i]
            if not signal or signal['net'] is None or signal['net'] <= 0:
                continue
            if any(r is None or r['net'] is None or r['net'] > 0 for r in prior):
                continue
            end = len(sessions)-1
            status, exit_date = 'open', None
            for j in range(i+1, len(sessions)):
                if series[j] is None or series[j]['net'] is None:
                    end, status = j-1, 'gap'
                    break
                if series[j]['net'] < 0:
                    end, status, exit_date = j-1, 'closed', sessions[j]
                    break
            meta = calendar.get('instruments', {}).get(code, {})
            followup = series[i+1:]
            # A known sale excludes the stock even if another date is missing.
            # Otherwise every follow-up sell amount must be observed as zero.
            no_sale_since = False if any(r and r.get('sell') is not None and r['sell'] > 0 for r in followup) else (
                True if all(r is not None and r.get('sell') == 0 for r in followup) else None)
            events.append(dict(id=f'{code}:{sessions[i]}', code=code, name=signal['name'], market=signal['market'],
                signal_date=sessions[i], signal_net=signal['net'], signal_close=signal['close'],
                status=status, exit_date=exit_date, end_date=sessions[end], holding_days=end-i,
                end_return=price_return(signal['close'], series[end]['close']),
                current_return=price_return(signal['close'], latest['close']) if latest else None,
                current_close=latest['close'] if latest else None, price_date=as_of if latest and latest['close'] else None,
                latest_net=latest['net'] if latest else None,
                no_sale_since=no_sale_since,
                market_cap=meta.get('market_cap'), sector=meta.get('sector'), metadata_date=meta.get('metadata_date'),
                tracking_days=len(sessions)-1-i,
                no_trade_prior=all(r.get('buy') == 0 and r.get('sell') == 0 for r in prior),
                strict_zero_prior=all(r['net'] == 0 for r in prior)))
    return dict(schema_version=1, as_of=as_of, first_date=first, sessions=len(sessions), lookback=lookback,
                signal_start=sessions[lookback] if len(sessions)>lookback else None, events=events)


def publish_entry_events(rows, calendar, target):
    result = build_entry_events(rows, calendar)
    save_json(target/'entry-events.json', result)
    return result
