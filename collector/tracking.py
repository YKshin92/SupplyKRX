"""Low-activity registrations, generated only into private data."""
from collections import defaultdict
from .core import save_json


def five_day_outcome(signal, after):
    """Next-session open entry through fifth-session close; no shortened windows."""
    empty = dict(return_5d=None, downside_5d=None, peak_5d=None, outcome_entry_date=None, outcome_end_date=None)
    if len(after) < 5:
        return dict(empty, outcome_status='pending')
    window = after[:5]
    if any(not r or any(r.get(k) is None or r[k] <= 0 for k in ('open','high','low','close','volume')) for r in window) or not signal.get('close'):
        return dict(empty, outcome_status='missing')
    previous = signal['close']
    for r in window:
        change = (r['close']/previous-1)*100
        if abs(change)>35 or r.get('change_pct') is not None and abs(change-r['change_pct'])>5:
            return dict(empty, outcome_status='price_break')
        previous = r['close']
    entry = window[0]['open']
    return dict(return_5d=(window[-1]['close']/entry-1)*100,
        downside_5d=min(0,(min(r['low'] for r in window)/entry-1)*100),
        peak_5d=(max(r['high'] for r in window)/signal['close']-1)*100,
        outcome_entry_date=window[0]['date'], outcome_end_date=window[-1]['date'], outcome_status='complete')


def build_tracking(rows, calendar, event_ids=None):
    histories = defaultdict(dict)
    foreigners = defaultdict(dict)
    for row in rows:
        if row['investor'] == '외국인':
            foreigners[row['code']][row['date']] = row
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
            if event_ids is not None and f'{code}:{signal["date"]}' not in event_ids:
                continue
            foreign = foreigners[code].get(signal['date'], {})
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
                signal_buy=signal.get('buy'), foreign_buy=foreign.get('buy'), foreign_net=foreign.get('net'),
                **five_day_outcome(signal, after),
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

