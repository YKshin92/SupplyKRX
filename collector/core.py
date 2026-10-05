"""Canonical schema and calculations. No third-party dependencies."""
from __future__ import annotations
import csv
import hashlib
import io
import json
import math
import os
import re
from datetime import date, datetime, timezone
from pathlib import Path

FIELDS = ['date','code','name','market','investor','scope','buy','sell','net','buy_volume','sell_volume','net_volume','close','change_pct','volume','turnover','source','collected_at','finality','open','high','low']
NUMBERS = ['open','high','low','buy','sell','net','buy_volume','sell_volume','net_volume','close','change_pct','volume','turnover']

def validate(raw: dict) -> dict:
    r = {k: raw.get(k, '') for k in FIELDS}
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',str(r['date'])):
        raise ValueError('거래일은 YYYY-MM-DD 형식이어야 합니다.')
    date.fromisoformat(str(r['date']))
    if not re.fullmatch(r'[0-9A-Z]{6}', str(r['code'])):
        raise ValueError('종목코드는 앞자리 0을 포함한 6자리 영숫자 문자열이어야 합니다.')
    if r['market'] not in ('KOSPI','KOSDAQ') or r['investor'] not in ('연기금 등','외국인'):
        raise ValueError('시장 또는 투자자 분류가 올바르지 않습니다.')
    if not all(r[k] for k in ['name','scope','source','collected_at','finality']):
        raise ValueError('종목명·출처·거래 범위·수집 시각·확정 상태가 필요합니다.')
    stamp = datetime.fromisoformat(str(r['collected_at']).replace('Z','+00:00'))
    if stamp.tzinfo is None:
        raise ValueError('수집 시각에는 시간대가 필요합니다.')
    if r['finality'] not in ('unknown','provisional','final','demo'):
        raise ValueError('잘못된 확정 상태입니다.')
    for k in NUMBERS:
        v = r[k]
        if v is None or v == '':
            r[k] = None
        else:
            n = float(v)
            if not math.isfinite(n) or abs(n) > 2**53 - 1:
                raise ValueError(f'{k}: 유효한 숫자가 아닙니다.')
            if k != 'change_pct' and not n.is_integer():
                raise ValueError(f'{k}: 원/주 단위 정수여야 합니다.')
            r[k] = n if k == 'change_pct' else int(n)
    for k in ['open','high','low','buy','sell','buy_volume','sell_volume','close','volume','turnover']:
        if r[k] is not None and r[k] < 0:
            raise ValueError(f'{k}: 음수는 허용되지 않습니다.')
    for buy, sell, net in [('buy','sell','net'), ('buy_volume','sell_volume','net_volume')]:
        if r[buy] is not None and r[sell] is not None:
            expected = r[buy] - r[sell]
            if r[net] is None:
                r[net] = expected
            elif r[net] != expected:
                raise ValueError(f'{r["code"]}: {net} 불일치')
    if r['volume'] == 0 and all(r[k] == 0 for k in ['open','high','low']):
        for k in ['open','high','low']: r[k] = None
    if all(r[k] is not None for k in ['open','high','low','close']):
        if r['low'] > min(r['open'],r['close']) or r['high'] < max(r['open'],r['close']) or r['high'] < r['low']:
            raise ValueError('OHLC 가격 범위 불일치')
    return r

def key(r):
    return tuple(r[k] for k in ['date','code','investor','scope'])

def read_csv(path: Path) -> list[dict]:
    with path.open(encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        if not (set(FIELDS)-{'open','high','low'}).issubset(reader.fieldnames or []):
            raise ValueError('표준 CSV 헤더가 필요합니다: ' + ','.join(FIELDS))
        return [validate(r) for r in reader]

def csv_text(rows):
    out = io.StringIO(newline='')
    w = csv.DictWriter(out, fieldnames=FIELDS, lineterminator='\n')
    w.writeheader()
    w.writerows({k: r.get(k) for k in FIELDS} for r in rows)
    return out.getvalue()

def atomic_text(path: Path, text: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(text, encoding='utf-8')
    os.replace(temp, path)

def save_json(path: Path, value):
    atomic_text(path, json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',',':')))

def upsert(root: Path, incoming: list[dict]):
    """Validate entire batch before mutating; each daily file replaced atomically."""
    rows = [validate(r) for r in incoming]
    seen = set()
    for r in rows:
        if key(r) in seen:
            raise ValueError('입력 배치에 중복 키가 있습니다.')
        seen.add(key(r))
    grouped = {}
    for r in rows:
        grouped.setdefault(r['date'], []).append(r)
    prepared = []
    for day, batch in grouped.items():
        path = root / 'daily' / f'{day}.csv'
        old = read_csv(path) if path.exists() else []
        merged = {key(r): r for r in old}
        for r in batch:
            previous = merged.get(key(r))
            if previous and any(previous[k] is not None and r[k] is None for k in NUMBERS):
                raise ValueError('재수집 결과에 기존 관측값의 결측이 발생했습니다. 기존 파일을 유지합니다.')
        merged.update({key(r): r for r in batch})
        prepared.append((path, csv_text(sorted(merged.values(), key=key))))
    for path, content in prepared:
        atomic_text(path, content)

def load_rows(root: Path):
    return [r for p in sorted((root/'daily').glob('*.csv')) for r in read_csv(p)]

def metrics(rows: list[dict], sessions: list[str], as_of: str):
    if len({r['investor'] for r in rows}) > 1:
        raise ValueError('투자자별로 나누어 계산해야 합니다.')
    index = {r['date']: r for r in rows}
    dates = [d for d in sessions if d <= as_of][-20:]
    latest = index.get(as_of)
    def total(n):
        ds = dates[-n:]
        values = [index.get(d, {}).get('net') for d in ds]
        return sum(values) if len(ds) == n and all(v is not None for v in values) else None
    streak, censored = 0, False
    for d in reversed(dates):
        net = index.get(d, {}).get('net')
        if net is None:
            streak = None
            break
        if net <= 0:
            break
        streak += 1
    else:
        censored = True
    eligible = [index.get(d, {}).get('turnover') for d in dates]
    sum20 = total(20)
    buy_only20 = sum20 is not None and any(index[d]['net'] > 0 for d in dates) and all(index[d]['net'] >= 0 for d in dates)
    denominator = sum(eligible) if eligible and all(v is not None for v in eligible) else None
    ratio = sum20 / denominator * 100 if sum20 is not None and denominator and denominator > 0 else None
    def traded(r):
        if not r: return None
        if r['buy'] is not None and r['sell'] is not None: return r['buy'] > 0 or r['sell'] > 0
        return True if r['net'] is not None and r['net'] != 0 else None
    return dict(sum5=total(5), sum20=sum20, buy_only20=buy_only20, streak=streak, streak_censored=censored,
                ratio20=ratio, active=traded(latest), active20=any(traded(index.get(d)) is True for d in dates),
                full_activity=bool(latest and latest['buy'] is not None and latest['sell'] is not None),
                days=sum(index.get(d,{}).get('net') is not None for d in dates),
                spark=[index.get(d,{}).get('net') for d in dates])

def validate_calendar(calendar: dict):
    sessions=calendar.get('sessions')
    if not isinstance(sessions,list) or not sessions or not calendar.get('source'):
        raise ValueError('거래일 목록과 출처가 필요합니다.')
    dates=sessions+[calendar.get('checked_through','')]
    for d in dates:
        if not isinstance(d,str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',d):
            raise ValueError('달력 날짜는 YYYY-MM-DD 형식이어야 합니다.')
        date.fromisoformat(d)
    if max(sessions)>calendar['checked_through']:
        raise ValueError('달력 확인일보다 미래인 거래일이 있습니다.')
    return sorted(set(sessions))

def publish(root: Path, target: Path, mode: str, calendar: dict):
    rows = load_rows(root)
    sessions = validate_calendar(calendar)
    if len({r['scope'] for r in rows}) > 1 or any(r['date'] not in sessions for r in rows):
        raise ValueError('거래 범위 또는 거래일이 일치하지 않습니다.')
    if mode == 'live' and any(r['finality'] == 'demo' for r in rows):
        raise ValueError('운영 데이터에 데모가 포함되어 있습니다.')
    results = {}
    for investor, suffix in [('외국인','foreign'),('연기금 등','')]:
        selected = [r for r in rows if r['investor'] == investor]
        if selected:
            results[investor] = publish_investor(selected,target/suffix,mode,calendar,investor)
    if not results: raise ValueError('게시할 데이터가 없습니다.')
    return results

def publish_investor(rows, target, mode, calendar, investor):
    if not rows: raise ValueError('게시할 데이터가 없습니다.')
    if mode not in ('demo','live'): raise ValueError('잘못된 모드')
    if mode == 'live' and any(r['finality'] == 'demo' for r in rows):
        raise ValueError('운영 데이터에 데모가 포함되어 있습니다.')
    sessions = validate_calendar(calendar)
    if any(r['date'] not in sessions for r in rows): raise ValueError('거래일 목록에 없는 데이터')
    scopes = {r['scope'] for r in rows}
    if len(scopes) != 1: raise ValueError('서로 다른 거래 범위를 한 화면에서 합산할 수 없습니다.')
    as_of = max(r['date'] for r in rows)
    display_dates = [d for d in sessions if d <= as_of][-20:]
    groups = {}
    for r in rows: groups.setdefault(r['code'], []).append(r)
    # Immutable generation: the manifest switches only after every file succeeds.
    generation = hashlib.sha256(json.dumps([rows,calendar],sort_keys=True,ensure_ascii=False).encode()).hexdigest()[:16]
    base = target / 'generations' / generation
    summary = []
    for code, history in sorted(groups.items()):
        history.sort(key=lambda r: r['date'])
        last = history[-1]
        latest = next((r for r in history if r['date'] == as_of), None)
        period = [r for r in history if r['date'] in display_dates]
        pricing = next((r for r in reversed(history) if r['close'] is not None), None)
        summary.append(dict(code=code, name=last['name'],market=last['market'],
            **calendar.get('instruments',{}).get(code,{}),
            buy=latest['buy'] if latest else None, sell=latest['sell'] if latest else None, net=latest['net'] if latest else None,
            close=pricing['close'] if pricing else None, price_date=pricing['date'] if pricing else None,
            change_pct=pricing['change_pct'] if pricing else None,
            source=last['source'],finality=latest['finality'] if latest else 'unknown',
            **metrics(history,sessions,as_of)))
        save_json(base/'stocks'/f'{code}.json',period)
        atomic_text(base/'csv'/f'{code}.csv', '\ufeff'+csv_text(period))
    summary.sort(key=lambda s: (s['net'] is not None, s['net'] or 0), reverse=True)
    save_json(base/'summary.json', summary)
    save_json(base/'instruments.json', [{k:s[k] for k in ['code','name','market']} for s in summary])
    manifest = dict(schema_version=1, investor=investor, mode=mode, as_of=as_of, sessions=sessions,
        calendar_checked_through=calendar['checked_through'],calendar_source=calendar['source'],
        generated_at=datetime.now(timezone.utc).isoformat(),
        collected_at=max(r['collected_at'] for r in rows),
        price_as_of=max((r['date'] for r in rows if r['close'] is not None), default=None),
        source=sorted({r['source'] for r in rows}), scope=next(iter(scopes)),
        row_count=len(rows),stock_count=len(summary), days=len(display_dates),
        missing_latest=sum(s['net'] is None for s in summary),
        partial20=sum(s['sum20'] is None for s in summary),
        generation=f'generations/{generation}', price_kind='close',status='validated')
    save_json(target/'manifest.json',manifest)
    return manifest
