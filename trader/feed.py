"""봇이 매일 읽는 신호 공급 파일 trading/feed.json — 사이트 시뮬레이션 입력(simulation-input.json)에서 최근 신호와 연기금 순매도만 뽑는다.

비공개 저장소 trader-feed.yml 이 매일 수집·과거 자료 갱신 뒤에 만들어 trading-state 가지(배포 안 함)에 올리고, PC 봇은
trader/sync.py 로 읽는다. 시뮬레이션과 같은 자료라서 봇의 신호는 사이트 신호와 같다.
usage: python -m trader.feed <simulation-input.json> --out feed.json [--days 10] [--sells-from <덧씌우기 전 simulation-input.json>]
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from .replay import load_input
from .rules import Settings, signal_passes, flow_exit_due

SCHEMA = 1


def build_feed(data: dict, *, days: int = 10, now: datetime | None = None, sells_from: dict | None = None) -> dict:
    """sells_from: 연기금 순매도를 가져올 입력. 사이트의 과거 자료 덧씌우기(overlay-history-web) 뒤 입력에는 순매도(sells)가 빠져 있어
    (2026-11-04 확인), 덧씌우기 전 수집 자료 입력(publish-simulation 결과)을 따로 넘긴다. 날짜로 맞춘다."""
    sessions = data['sessions']
    first = max(0, len(sessions) - days)
    signals, sells = [], []
    for c in data['stocks']:
        seen = set()
        for sig in c['signals']:
            i = sig['index']
            if i < first or i in seen:
                continue
            seen.add(i)
            bar = c['prices'][i] or {}
            signals.append(dict(code=c['code'], name=c['name'], market=c.get('market'), signal_date=sessions[i], net=sig['net'], score=sig['score'],
                                quiet_3m=sig.get('quiet_3m'), volume_ratio_20=sig.get('volume_ratio_20'), close=bar.get('close')))
        if sells_from is None:
            for i, v in c.get('sells') or []:
                if i >= first:
                    sells.append(dict(code=c['code'], date=sessions[i], net_sell=v))
    if sells_from is not None:
        recent = set(sessions[first:])
        for c in sells_from['stocks']:
            for i, v in c.get('sells') or []:
                d = sells_from['sessions'][i]
                if d in recent:
                    sells.append(dict(code=c['code'], date=d, net_sell=v))
    signals.sort(key=lambda x: (x['signal_date'], x['code']))
    sells.sort(key=lambda x: (x['date'], x['code']))
    return dict(schema=SCHEMA, as_of=sessions[-1], sessions=sessions[first:], signals=signals, sells=sells,
                generated_at=(now or datetime.now(timezone.utc)).isoformat(timespec='seconds'))


def check_feed(feed) -> dict:
    if not isinstance(feed, dict) or feed.get('schema') != SCHEMA or not isinstance(feed.get('as_of'), str):
        raise ValueError('신호 공급 파일 형식을 읽을 수 없습니다.')
    return feed


def pension_sells(feed: dict, day: str) -> dict[str, float]:
    return {x['code']: x['net_sell'] for x in feed['sells'] if x['date'] == day}


def add_feed_signals(book: dict, feed: dict, *, stale_after: int = 5) -> list[dict]:
    """공급 파일의 운영 조건 신호를 대기열에 넣는다(이미 본 신호 제외, 점수 없는 신호는 사지 않음 — 시뮬레이션과 같음).
    PC가 며칠 꺼져 있다가 늦게 알게 된 신호(공급일 기준 stale_after 거래일보다 오래됨)는 사지 않고 기록만 한다."""
    sessions = feed['sessions']
    age = {d: len(sessions) - 1 - k for k, d in enumerate(sessions)}
    seen = set(book['seen'])
    added = []
    for sig in feed['signals']:
        key = f"{sig['code']}:{sig['signal_date']}"
        if key in seen or sig['signal_date'] > feed['as_of'] or not signal_passes(sig):
            continue
        seen.add(key)
        book['seen'].append(key)
        if sig.get('score') is None:
            continue
        if age.get(sig['signal_date'], len(sessions)) > stale_after:
            book['orders'].append(dict(kind='skip', date=feed['as_of'], code=sig['code'], signal_date=sig['signal_date'], reason=f'{stale_after}거래일 넘게 지나서 알게 된 신호 · 매수하지 않음'))
            continue
        item = dict(code=sig['code'], name=sig['name'], signal_date=sig['signal_date'], signal_net=sig['net'], score=sig['score'])
        book['pending'].append(item)
        added.append(item)
    return added


def missed_flow_flags(book: dict, feed: dict, s: Settings, since: str | None) -> list[str]:
    """PC가 꺼져 있던 날(since 이후 ~ 공급일 전날)의 연기금 순매도도 확인해 시가 매도 예약을 놓치지 않는다. 공급일 당일은 after_close 가 본다."""
    flagged = []
    for x in feed['sells']:
        if (since and x['date'] <= since) or x['date'] >= feed['as_of']:
            continue
        pos = book['positions'].get(x['code'])
        if pos and pos['flow_flag'] is None and x['date'] >= pos['entry_date'] and flow_exit_due(pos, x['net_sell'], s):
            pos['flow_flag'] = x['date']
            flagged.append(x['code'])
    return flagged


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input')
    ap.add_argument('--out', required=True)
    ap.add_argument('--days', type=int, default=10)
    ap.add_argument('--sells-from', help='연기금 순매도를 가져올 덧씌우기 전 simulation-input.json')
    a = ap.parse_args()
    feed = build_feed(load_input(a.input), days=a.days, sells_from=load_input(a.sells_from) if a.sells_from else None)
    Path(a.out).write_text(json.dumps(feed, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f"feed {feed['as_of']}: signals {len(feed['signals'])}, sells {len(feed['sells'])}")


if __name__ == '__main__':
    main()
