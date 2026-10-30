"""Signal performance lab: pension, 8-item rank and RSI buy signals measured with one rule set.

Every signal is judged only with prices after it:
- Entry: next KRX session open (no entry when that bar is missing, zero volume or a price break).
- Fixed horizons: close after 5/10/20/60 held sessions vs entry open, and the same-span index move
  (KOSPI or KOSDAQ, index open on the entry day to index close on the exit day) as excess return.
- Barriers: +30%/-10% (default, same as the simulation) and +10%/-5% (RSI comparison). First touch wins;
  an opening gap beyond a barrier fills at the open; a day touching both without a gap counts as stop.
  A price gap or break during the scan stops it (status 'missing' if nothing was reached yet).
- Repeat signals of the same stock within COOLDOWN sessions of a counted one are not counted again.
- 'backtest' = rule applied to past data afterwards. 'forward' = signal frozen in the signal log on its
  own day after the close (data/live/signal-log). Both are reported separately and never mixed.
Costs, taxes and dividends are not included.
"""
from datetime import datetime, timedelta, timezone
from statistics import mean, median
import gzip
import json
import math
from pathlib import Path

from .simulation import price_problem

HORIZONS = (5, 10, 20, 60)
RULES = (('30/10', 30, 10), ('10/5', 10, 5))
COOLDOWN = 20
TOP = 20
SETTLED = 60  # Wilder RSI needs this many changes since a restart before an entry counts
RECENT_SESSIONS = 20
KST = timezone(timedelta(hours=9))
STRATEGIES = [
    dict(key='pension', label='연기금 신호', description='기본 신호 + 직전 3개월 연기금 매수 0원 + 신호일 거래량 20일 평균 3배 이하'),
    dict(key='rank8', label='8항목 수급 상위 20 신규 진입', description='날짜별로 고정 기록한 8항목 수급 점수 상위 20위에 전 거래일에는 없다가 새로 들어온 종목 (2026-10-29부터 기록)'),
    dict(key='rsi', label='RSI 30 하향 진입', description='Wilder RSI(14)가 전일 30 이상에서 당일 30 미만으로 내려온 날 (재시작 후 60거래일 이상 안정화된 값만)'),
    dict(key='rsi_rank', label='RSI 진입 + 수급 상위 20', description='RSI 30 하향 진입일에 8항목 수급 점수 상위 20위인 종목'),
    dict(key='rsi_pension', label='RSI 진입 + 연기금 신호', description='RSI 30 하향 진입과 연기금 신호가 5거래일 안에 함께 나온 경우 (둘 중 늦은 날을 신호일로)'),
]


def wilson(k, n, z=1.96):
    if not n:
        return None
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return [round((c - h) / d * 100, 1), round((c + h) / d * 100, 1)]


def barrier(prices, sessions, start, entry, take, stop):
    """First touch from the entry session; mirrors collector.touch_outcome with variable barriers."""
    up, down = entry * (1 + take / 100), entry * (1 - stop / 100)
    for i in range(start, len(sessions)):
        row = prices.get(sessions[i])
        problem = price_problem(prices.get(sessions[i - 1]), row) if i > start else None
        if problem or row is None:
            return dict(status='missing', reason=f'{sessions[i]} {problem or "가격 없음"}', days=None, ret=None, date=None)
        hit_up, hit_down = row['high'] >= up, row['low'] <= down
        if not (hit_up or hit_down):
            continue
        if row['open'] <= down:
            status, price = 'stop', row['open']
        elif row['open'] >= up:
            status, price = 'take', row['open']
        elif hit_down:
            status, price = 'stop', down
        else:
            status, price = 'take', up
        return dict(status=status, date=sessions[i], days=i - start + 1, ret=round((price / entry - 1) * 100, 2), reason=None)
    last = prices.get(sessions[-1]) if sessions else None
    return dict(status='open', date=None, days=len(sessions) - start, ret=round((last['close'] / entry - 1) * 100, 2) if last else None, reason=None)


def evaluate(prices, sessions, pos, signal_date, index_prices):
    i = pos.get(signal_date)
    out = dict(entry_date=None, entry_price=None, status='waiting', horizons={}, rules={})
    if i is None:
        return dict(out, status='missing')
    if i + 1 >= len(sessions):
        return out
    start = i + 1
    entry_row = prices.get(sessions[start])
    problem = price_problem(prices.get(signal_date), entry_row)
    if problem:
        return dict(out, status='missing', reason=problem)
    entry = entry_row['open']
    out.update(entry_date=sessions[start], entry_price=entry, status='entered')
    idx_open = (index_prices.get(sessions[start]) or {}).get('open')
    for h in HORIZONS:
        j = start + h - 1
        if j >= len(sessions):
            out['horizons'][h] = dict(status='pending')
            continue
        broken = any(price_problem(prices.get(sessions[k - 1]), prices.get(sessions[k])) for k in range(start + 1, j + 1))
        if broken:
            out['horizons'][h] = dict(status='missing')
            continue
        ret = (prices[sessions[j]]['close'] / entry - 1) * 100
        idx_close = (index_prices.get(sessions[j]) or {}).get('close')
        idx = (idx_close / idx_open - 1) * 100 if idx_open and idx_close else None
        out['horizons'][h] = dict(status='complete', ret=round(ret, 2), index=None if idx is None else round(idx, 2),
                                  excess=None if idx is None else round(ret - idx, 2))
    for name, take, stop in RULES:
        out['rules'][name] = barrier(prices, sessions, start, entry, take, stop)
    return out


def summarize(items):
    result = dict(signals=len(items), entered=sum(1 for s in items if s['entry_date']), rules={}, horizons={})
    for name, _, _ in RULES:
        rs = [s['rules'].get(name) for s in items if s['rules'].get(name)]
        take = sum(r['status'] == 'take' for r in rs)
        stop = sum(r['status'] == 'stop' for r in rs)
        resolved = [r for r in rs if r['status'] in ('take', 'stop')]
        result['rules'][name] = dict(take=take, stop=stop, open=sum(r['status'] == 'open' for r in rs), missing=sum(r['status'] == 'missing' for r in rs),
                                     win_rate=round(take / (take + stop) * 100, 1) if take + stop else None, ci=wilson(take, take + stop),
                                     avg_return=round(mean(r['ret'] for r in resolved), 2) if resolved else None,
                                     avg_days=round(mean(r['days'] for r in resolved), 1) if resolved else None)
    for h in HORIZONS:
        done = [s['horizons'][h] for s in items if s['horizons'].get(h, {}).get('status') == 'complete']
        ex = [d['excess'] for d in done if d['excess'] is not None]
        result['horizons'][h] = dict(count=len(done), mean=round(mean(d['ret'] for d in done), 2) if done else None,
                                     median=round(median(d['ret'] for d in done), 2) if done else None,
                                     excess=round(mean(ex), 2) if ex else None,
                                     positive=round(sum(d['ret'] > 0 for d in done) / len(done) * 100, 1) if done else None)
    return result


def monthly(items):
    groups = {}
    for s in items:
        groups.setdefault(s['signal_date'][:7], []).append(s)
    out = []
    for month in sorted(groups):
        g = groups[month]
        rs = [s['rules']['30/10']['status'] for s in g if s['rules'].get('30/10')]
        take, stop = rs.count('take'), rs.count('stop')
        ex = [s['horizons'][20]['excess'] for s in g if s['horizons'].get(20, {}).get('status') == 'complete' and s['horizons'][20]['excess'] is not None]
        out.append(dict(month=month, signals=len(g), take=take, stop=stop, win_rate=round(take / (take + stop) * 100, 1) if take + stop else None,
                        excess20=round(mean(ex), 2) if ex else None, excess20_count=len(ex)))
    return out


def rank_entries(root):
    """Top-20 new entries per frozen 8-item snapshot day, plus each day's top-20 set."""
    from .score_snapshots import read_snapshot
    base = Path(root) / 'data/live/score-snapshots'
    days = {}
    for path in sorted(base.glob('*/*/snapshot.json')):
        try:
            header = read_snapshot(path)
        except (ValueError, KeyError, OSError):
            continue
        day = header['as_of']
        if day in days and days[day]['header']['captured_at'] <= header['captured_at']:
            continue  # keep the first capture of a day
        stocks = []
        for part in header['parts']:
            stocks += json.loads(gzip.decompress((path.parent / part['file']).read_bytes()))
        ranked = sorted((s for s in stocks if s['score'] is not None), key=lambda s: (-s['score'], s['code']))[:TOP]
        days[day] = dict(header=header, top=[s['code'] for s in ranked], scores={s['code']: s['score'] for s in ranked})
    ordered = sorted(days)
    entries = []
    for prev, day in zip(ordered, ordered[1:]):
        before = set(days[prev]['top'])
        for rank, code in enumerate(days[day]['top'], 1):
            if code not in before:
                entries.append(dict(code=code, signal_date=day, rank=rank, score=days[day]['scores'][code], previous_snapshot=prev,
                                    frozen=days[day]['header']['capture_kind'] == 'same_day_after_close'))
    frozen_days = {d for d, v in days.items() if v['header']['capture_kind'] == 'same_day_after_close'}
    return entries, {d: set(v['top']) for d, v in days.items()}, frozen_days


def frozen_log(root):
    """(strategy, code, date) recorded on the signal day after the close."""
    out = set()
    for path in sorted((Path(root) / 'data/live/signal-log').glob('????-??-??.json')):
        data = json.loads(path.read_text(encoding='utf-8'))
        if data.get('capture_kind') != 'same_day_after_close' or data.get('as_of') != path.stem:
            continue
        for s in data.get('signals', []):
            out.add((s['strategy'], s['code'], data['as_of']))
    return out


def publish_signal_lab(root, target, rsi_keep, index_prices, as_of):
    from .core import save_json
    root = Path(root)
    histories = rsi_keep['history']  # code -> date -> row (warm-up + live)
    rsi_series = rsi_keep['series']
    names = rsi_keep['names']
    markets = rsi_keep['markets']
    krx = sorted(set(index_prices.get('KOSPI', {})) | set(rsi_keep['sessions']))
    sessions = [d for d in krx if d <= as_of]
    pos = {d: i for i, d in enumerate(sessions)}
    prices = {c: dict(h) for c, h in histories.items()}

    # Pension signals from the 3-year tracking history; prices from the per-stock history files.
    hw = root / 'data/history-web'
    pension = []
    if (hw / 'tracking-history.json').exists():
        events = []
        for part in json.loads((hw / 'tracking-history.json').read_text(encoding='utf-8'))['files']:
            events += json.loads((hw / part).read_text(encoding='utf-8'))
        for e in events:
            if e.get('quiet_3m') is True and e.get('volume_ratio_20') is not None and e['volume_ratio_20'] <= 3:
                pension.append(dict(code=e['code'], signal_date=e['signal_date'], name=e['name'], market=e['market'], net=e.get('signal_net')))
                names.setdefault(e['code'], e['name'])
                markets.setdefault(e['code'], e['market'])
        for code in {p['code'] for p in pension}:
            f = hw / f'history-stock-{code}.json'
            if f.exists():
                rows = json.loads(f.read_text(encoding='utf-8')).get('pension', [])
                target_rows = prices.setdefault(code, {})
                for r in rows:
                    target_rows.setdefault(r['date'], r)

    ranks, top_sets, frozen_days = rank_entries(root)
    rsi = []
    for code, series in rsi_series.items():
        for a, b in zip(series, series[1:]):
            if a['rsi'] is not None and b['rsi'] is not None and a['rsi'] >= 30 > b['rsi'] and (b.get('since_reset') or 0) >= SETTLED:
                rsi.append(dict(code=code, signal_date=b['date'], rsi=round(b['rsi'], 2)))
    rsi_rank = [dict(s, rank_top20=True, frozen=s['signal_date'] in frozen_days) for s in rsi if s['code'] in top_sets.get(s['signal_date'], ())]
    rsi_by_code = {}
    for s in rsi:
        rsi_by_code.setdefault(s['code'], []).append(s)
    rsi_pension = []
    for p in pension:
        for s in rsi_by_code.get(p['code'], []):
            if p['signal_date'] in pos and s['signal_date'] in pos and abs(pos[p['signal_date']] - pos[s['signal_date']]) <= 5:
                rsi_pension.append(dict(code=p['code'], signal_date=max(p['signal_date'], s['signal_date']), rsi=s['rsi'], pension_date=p['signal_date']))

    logged = frozen_log(root)
    raw = dict(pension=pension, rank8=ranks, rsi=rsi, rsi_rank=rsi_rank, rsi_pension=rsi_pension)
    strategies, recent, today = [], [], []
    recent_from = sessions[-RECENT_SESSIONS] if len(sessions) >= RECENT_SESSIONS else sessions[0]
    for spec in STRATEGIES:
        key = spec['key']
        counted, last_index = [], {}
        for s in sorted(raw[key], key=lambda s: (s['signal_date'], s['code'])):
            i = pos.get(s['signal_date'])
            if i is None or s['signal_date'] > as_of:
                continue
            if s['code'] in last_index and i - last_index[s['code']] < COOLDOWN:
                continue
            last_index[s['code']] = i
            market = markets.get(s['code'])
            result = evaluate(prices.get(s['code'], {}), sessions, pos, s['signal_date'], index_prices.get(market, {}))
            forward = (key, s['code'], s['signal_date']) in logged or (key in ('rank8', 'rsi_rank') and bool(s.get('frozen')))
            item = dict(s, strategy=key, name=names.get(s['code'], s['code']), market=market, forward=forward, **result)
            counted.append(item)
        back = [s for s in counted if not s['forward']]
        fwd = [s for s in counted if s['forward']]
        first = counted[0]['signal_date'] if counted else None
        strategies.append(dict(spec, first_signal=first, backtest=summarize(back), forward=summarize(fwd), monthly=monthly(counted),
                               forward_only=key in ('rank8', 'rsi_rank')))
        recent += [s for s in counted if s['signal_date'] >= recent_from]
        today += [dict(strategy=key, code=s['code']) for s in counted if s['signal_date'] == as_of]
    recent.sort(key=lambda s: (s['signal_date'], s['strategy'], s['code']), reverse=True)
    result = dict(schema_version=1, as_of=as_of, period=dict(first=sessions[0] if sessions else None, last=as_of),
                  rules=dict(entry='신호 다음 거래일 시가', horizons=list(HORIZONS), barriers=[dict(name=n, take=t, stop=s) for n, t, s in RULES],
                             cooldown=COOLDOWN, top=TOP, rsi_settled=SETTLED, same_day='익절·손절 동시 도달은 손절(시가 갭은 시가 체결)',
                             costs='수수료·세금·배당 미반영', universe='RSI는 현재 상장 보통주(상장폐지 종목 제외), 연기금은 3년 추적 이력'),
                  strategies=strategies, recent=recent, today=today)
    save_json(Path(target) / 'signal-lab' / 'latest.json', result)
    return result


def freeze_signal_log(root, projection, now=None):
    """Write today's signals once, after the close, into the private immutable signal log."""
    now = now or datetime.now(timezone.utc)
    data = json.loads((Path(projection) / 'signal-lab/latest.json').read_text(encoding='utf-8'))
    day = data['as_of']
    local = now.astimezone(KST)
    path = Path(root) / 'data/live/signal-log' / f'{day}.json'
    if path.exists():
        return dict(state='exists', as_of=day)
    if day > local.date().isoformat():
        raise ValueError('Cannot record future signals')
    kind = 'same_day_after_close' if day == local.date().isoformat() and local.hour >= 16 else 'late_capture'
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = dict(schema_version=1, as_of=day, captured_at=now.isoformat(timespec='seconds'), capture_kind=kind,
                   signals=sorted(data['today'], key=lambda s: (s['strategy'], s['code'])))
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding='utf-8')
    return dict(state='created', as_of=day, capture_kind=kind, signals=len(payload['signals']))
