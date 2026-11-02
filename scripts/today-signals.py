"""Today's 연기금 매매법 signals (the simulation's default conditions) from the live daily files, for the daily alert.

Signal on day d: 연기금 net buy >= 3억; no 연기금 buy and no 연기금 sell on any session from d minus 3 calendar months
(window must be fully observed; 3개월 무거래, from 2026-11-02); signal-day volume <= 3x the previous 20-session average. The older check
'each of the 10 previous sessions has buy and sell below 1억' is kept in code but is implied by the 3-month rule. Same rules as scripts/build-history-web.py + publish-simulation.py (quiet3m-volume). Reference only.
usage: today-signals.py --root <private data repo> [--date YYYY-MM-DD]   (prints JSON; with GITHUB_ACTIONS also a notice)
"""
import argparse
import calendar as month_calendar
import csv
import gzip
import json
import os
from datetime import date
from pathlib import Path
from statistics import mean

NUM = ('buy', 'sell', 'net', 'open', 'close', 'volume')


def cut(day, months=3):
    d = date.fromisoformat(day)
    y, m = divmod(d.year * 12 + d.month - 1 - months, 12)
    m += 1
    return date(y, m, min(d.day, month_calendar.monthrange(y, m)[1])).isoformat()


def load(root):
    # Live daily files, plus the verified archive copies before live collection began (data/live/detail-backfill) so the
    # 3-month window is fully observed; live wins on any shared date.
    files = {p.name.removesuffix('.csv.gz'): p for p in (root / 'data/live/detail-backfill').glob('????-??-??.csv.gz')}
    files.update({p.stem: p for p in (root / 'data/live/daily').glob('????-??-??.csv')})
    days, rows = [], {}
    for day in sorted(files):
        p = files[day]
        days.append(day)
        with (gzip.open(p, 'rt', encoding='utf-8-sig', newline='') if p.suffix == '.gz' else p.open(encoding='utf-8-sig', newline='')) as f:
            for r in csv.DictReader(f):
                if r['investor'] != '연기금 등':
                    continue
                rows.setdefault(r['code'], {})[day] = {**{k: (float(r[k]) if r.get(k) not in ('', None) else None) for k in NUM}, 'name': r['name'], 'market': r['market']}
    return days, rows


def signals(days, rows, day):
    i = days.index(day)
    out = []
    for code, hist in rows.items():
        r = hist.get(day)
        if not r or r['net'] is None or r['net'] < 3e8:
            continue
        prior = [hist.get(d) for d in days[max(0, i - 10):i]]
        if len(prior) != 10 or any(not p or any(p[k] is None or not 0 <= p[k] < 1e8 for k in ('buy', 'sell')) for p in prior):
            continue
        start = cut(day)
        if start < days[0]:
            continue  # the 3-month window is not fully observed
        window = [hist.get(d) for d in days[:i] if d >= start]
        if any(not p or p['buy'] is None or p['sell'] is None for p in window) or any(p['buy'] != 0 or p['sell'] != 0 for p in window):
            continue
        vols = [hist.get(d, {}).get('volume') for d in days[max(0, i - 20):i]]
        if len(vols) != 20 or any(v is None for v in vols) or not mean(vols) > 0 or r['volume'] is None:
            continue
        ratio = r['volume'] / mean(vols)
        if ratio > 3:
            continue
        candle = None if not r['open'] or not r['close'] else 'bull' if r['close'] > r['open'] else 'bear' if r['close'] < r['open'] else 'flat'
        out.append(dict(code=code, name=r['name'], market=r['market'], net=r['net'], close=r['close'], candle=candle, volume_ratio=round(ratio, 2)))
    return sorted(out, key=lambda s: -s['net'])


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', type=Path, required=True)
    ap.add_argument('--date')
    a = ap.parse_args()
    days, rows = load(a.root)
    day = a.date or days[-1]
    found = signals(days, rows, day)
    print(json.dumps(dict(date=day, signals=found), ensure_ascii=False))
    if os.environ.get('GITHUB_ACTIONS'):
        label = {'bull': '양봉', 'bear': '음봉', 'flat': '보합', None: '캔들 미확인'}
        text = ' | '.join(f"{s['name']}({s['code']}) 순매수 {s['net'] / 1e8:.1f}억 {label[s['candle']]} 거래량 {s['volume_ratio']}배" for s in found) or '없음'
        print(f"::notice title=Pension signals {day}::{len(found)}건 - {text}")
        summary = os.environ.get('GITHUB_STEP_SUMMARY')
        if summary:
            with open(summary, 'a', encoding='utf-8') as f:
                f.write(f"### 연기금 매매법 신호 {day}: {len(found)}건\n\n{text}\n")
