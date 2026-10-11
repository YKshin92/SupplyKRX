"""Low-activity registrations, generated only into private data."""
from collections import defaultdict
from .core import save_json


def build_tracking(rows, calendar):
    histories = defaultdict(dict)
    for row in rows:
        if row['investor'] == '연기금 등':
            histories[row['code']][row['date']] = row
    dates = sorted({d for h in histories.values() for d in h})
    sessions = [d for d in calendar['sessions'] if dates[0] <= d <= dates[-1]]
    events = []
    for code, history in histories.items():
        series = [history.get(d) for d in sessions]
        latest = series[-1]
        meta = calendar.get('instruments', {}).get(code, {})
        for i in range(10, len(series)):
            signal = series[i]
            if not signal or signal.get('net') is None or signal['net'] < 1e8:
                continue
            prior = {}
            for window in (10, 20):
                before = series[i-window:i] if i >= window else []
                if len(before) != window or any(r is None or r.get('buy') is None or r.get('sell') is None for r in before):
                    prior[str(window)] = None
                else:
                    prior[str(window)] = dict(max_buy=max(r['buy'] for r in before), max_sell=max(r['sell'] for r in before),
                        avg_gross=sum(r['buy']+r['sell'] for r in before)/window,
                        absent_days=sum(r.get('flow_status') == 'absent_zero' for r in before))
            if prior['10'] is None and prior['20'] is None:
                continue
            after = series[i+1:]
            missing_net = any(r is None or r.get('net') is None for r in after)
            missing_sell = any(r is None or r.get('sell') is None for r in after)
            net_sell_days = sum(r['net'] < 0 for r in after if r and r.get('net') is not None)
            gross_sell_days = sum(r['sell'] > 0 for r in after if r and r.get('sell') is not None)
            events.append(dict(id=f'{code}:{signal["date"]}', code=code, name=signal['name'], market=signal['market'],
                signal_date=signal['date'], signal_net=signal['net'], signal_close=signal.get('close'),
                tracking_days=len(after), prior=prior,
                current_return=(latest['close']/signal['close']-1)*100 if latest and latest.get('close') and signal.get('close') else None,
                current_close=latest.get('close') if latest else None,
                latest_net=latest.get('net') if latest else None,
                sum_since=None if missing_net else signal['net']+sum(r['net'] for r in after),
                buy_days=1+sum(r['net'] > 0 for r in after if r and r.get('net') is not None),
                buy_days_complete=not missing_net,
                no_net_sale=False if net_sell_days else None if missing_net else True,
                no_gross_sale=False if gross_sell_days else None if missing_sell else True,
                net_sell_days=net_sell_days, gross_sell_days=gross_sell_days,
                spark=[r.get('net') if r else None for r in series[i:]],
                market_cap=meta.get('market_cap'), sector=meta.get('sector'), metadata_date=meta.get('metadata_date')))
    return dict(schema_version=1, as_of=sessions[-1], first_date=sessions[0], sessions=sessions, minimum_net=1e8, events=events)


def publish_tracking(rows, calendar, target):
    result = build_tracking(rows, calendar)
    save_json(target/'tracking-events.json', result)
    return result
