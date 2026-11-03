"""봇 장부 — 보유·대기 신호·청산 기록·오늘 매수 합계를 PC의 JSON 파일 하나에 둔다(키·비밀번호는 여기 두지 않는다).

현금과 실제 보유 수량은 증권사 계좌가 기준이다. 장부는 매수가·신호 정보처럼 계좌에 없는 것을 기억하고, 시작할 때마다 계좌와 맞춰 본다.
"""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

from .rules import signal_passes

EMPTY = dict(version=1, positions={}, pending=[], seen=[], trades=[], orders=[], halted={}, day=None, equity_prev_close=None, equity_history=[])


def load(path: str | Path) -> dict:
    path = Path(path)
    if not path.exists():
        return json.loads(json.dumps(EMPTY))
    book = json.loads(path.read_text(encoding='utf-8'))
    if book.get('version') != 1:
        raise ValueError('지원하지 않는 장부 형식입니다.')
    for k, v in EMPTY.items():
        book.setdefault(k, json.loads(json.dumps(v)))
    return book


def save(book: dict, path: str | Path) -> None:
    """중간에 꺼져도 장부가 깨지지 않게 임시 파일에 쓴 뒤 바꿔 끼운다."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix='.book-', suffix='.json')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(book, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def start_day(book: dict, today: str) -> None:
    if (book.get('day') or {}).get('date') != today:
        book['day'] = dict(date=today, bought=0.0)


def add_signals(book: dict, data: dict, *, since: str, until: str | None = None) -> list[dict]:
    """사이트 시뮬레이션 입력(simulation-input.json)에서 since~until(포함)의 운영 조건 신호를 대기열에 넣는다. 이미 본 신호는 다시 넣지 않는다."""
    days = data['sessions']
    seen = set(book['seen'])
    added = []
    for c in data['stocks']:
        for sig in c['signals']:
            day = days[sig['index']]
            key = f"{c['code']}:{day}"
            if day < since or (until and day > until) or key in seen or not signal_passes(sig):
                continue
            seen.add(key)
            book['seen'].append(key)
            if sig.get('score') is None:
                continue  # 시뮬레이션과 같이 점수 없는 신호는 사지 않는다
            item = dict(code=c['code'], name=c['name'], signal_date=day, signal_net=sig['net'], score=sig['score'])
            book['pending'].append(item)
            added.append(item)
    return added


def held_codes(book: dict) -> set[str]:
    return set(book['positions']) | set(book['halted'])


def log(book: dict, kind: str, **fields) -> dict:
    entry = dict(kind=kind, **fields)
    book['orders'].append(entry)
    return entry
