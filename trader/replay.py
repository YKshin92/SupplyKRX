"""과거 일봉으로 봇 규칙을 하루씩 돌려 본다 — 사이트 시뮬레이션과 같은 결과가 나오는지 대조하는 용도.

입력은 사이트가 쓰는 simulation-input.json(+ simulation-stocks-NNN.json). 기업행사 정산·쉬는 현금 ETF는 빼고(corporate 없음,
idle 없음) 시뮬레이션과 비교한다. 상장폐지 추정 정산은 미래 자료를 보는 백테스트 전용 처리라 실제 봇에는 없다.
usage: python -m trader.replay <simulation-input.json> [--start YYYY-MM-DD] [--settings JSON] [--out trades.json]
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from .rules import Settings, signal_passes, queue_order, size_buy, open_gap_problem, exit_on_bar, sale_pnl, flow_exit_due, price_problem, positive


def load_input(path: str | Path) -> dict:
    path = Path(path)
    data = json.loads(path.read_text(encoding='utf-8'))
    if data.get('stock_files'):
        data['stocks'] = [s for f in data['stock_files'] for s in json.loads((path.parent / f).read_text(encoding='utf-8'))]
    return data


def replay(data: dict, s: Settings = Settings(), *, initial: float = 20_000_000, start: str | None = None) -> dict:
    days = data['sessions']
    start_i = next(i for i, d in enumerate(days) if d >= (start or days[0]))
    by_code = {c['code']: c for c in data['stocks']}
    sells = {c['code']: {i: v for i, v in (c.get('sells') or [])} for c in data['stocks']}
    trades = []
    for c in data['stocks']:
        seen = set()
        for sig in c['signals']:
            if sig['index'] < start_i or not signal_passes(sig) or sig['index'] in seen:
                continue
            seen.add(sig['index'])
            trades.append(dict(code=c['code'], name=c['name'], signal_index=sig['index'], signal_date=days[sig['index']], signal_net=sig['net'],
                               score=sig['score'], status='pending' if sig['score'] is not None else 'score_missing', reason=None,
                               entry_index=None, entry_date=None, entry_price=None, shares=0, invested=0.0,
                               exit_date=None, exit_price=None, pnl=None, flow_flag=None))
    cash = float(initial)
    ledger = []
    for i in range(start_i, len(days)):
        held_codes = {t['code'] for t in trades if t['status'] in ('open', 'unresolved')}
        for t in trades:
            if t['status'] == 'pending' and t['signal_index'] == i - 1 and t['code'] in held_codes:
                t.update(status='skipped', reason='신호 확인 시 이미 보유 중 · 추가 매수 제외')
        held = [t for t in trades if t['status'] in ('open', 'unresolved')]
        base = ledger[-1]['equity'] if ledger and ledger[-1]['equity'] is not None else cash + sum(t['invested'] + (t['pnl'] or 0) for t in held)
        # 장 시작: 대기 신호 매수(점수 순). 같은 날 매도 대금은 다음 거래일부터 쓴다.
        for t in queue_order([t for t in trades if t['status'] == 'pending' and t['signal_index'] < i]):
            if t['code'] in held_codes:
                t.update(status='skipped', reason='동일 종목 중복 대기 신호 제외')
                continue
            c = by_code[t['code']]
            r, prev = c['prices'][i], c['prices'][i - 1]
            problem = open_gap_problem(r and r.get('open'), prev and prev.get('close'), s)
            if problem:
                t['reason'] = problem + ' · 다음 거래일 재검토'
                continue
            shares, cost, why = size_buy(r['open'], cash, base, s)
            if not shares:
                t['reason'] = why
                continue
            held_codes.add(t['code'])
            cash -= cost
            t.update(status='open', reason='최신 종가 평가', entry_index=i, entry_date=days[i], entry_price=r['open'], shares=shares, invested=cost)
        # 보유 종목 평가: 시가 청산(연기금 순매도 예약·갭) → 장중 손절/익절 → 종가 평가와 연기금 순매도 확인.
        for t in trades:
            if t['status'] != 'open':
                continue
            c = by_code[t['code']]
            r = c['prices'][i]
            problem = price_problem(c['prices'][i - 1], r)
            if problem:
                if i <= len(days) - 6 and not any(p and not price_problem(c['prices'][i + j - 1], p) for j, p in enumerate(c['prices'][i:])):
                    k = i - 1
                    while k > t['entry_index'] and price_problem(c['prices'][k - 1], c['prices'][k]):
                        k -= 1
                    price = c['prices'][k]['close']
                    pnl = sale_pnl(t['shares'], price, t['invested'], s)
                    t.update(status='delisted', exit_date=days[k], exit_price=price, pnl=pnl)
                    cash += t['invested'] + pnl
                    continue
                t.update(status='unresolved', reason=days[i] + ' ' + problem, pnl=None, exit_date=None, exit_price=None)
                continue
            hit = exit_on_bar(t['entry_price'], r, bool(t['flow_flag']), s)
            if hit:
                status, price, reason = hit
                pnl = sale_pnl(t['shares'], price, t['invested'], s)
                t.update(status=status, reason=reason, exit_date=days[i], exit_price=price, pnl=pnl)
                cash += t['invested'] + pnl
                continue
            t.update(pnl=round((t['shares'] * r['close'] - t['invested']) * 1e4) / 1e4, exit_date=days[i], exit_price=r['close'])
            if flow_exit_due(t, sells[t['code']].get(i), s):
                t['flow_flag'] = days[i]
        held = [t for t in trades if t['status'] in ('open', 'unresolved')]
        unknown = [t for t in held if t['pnl'] is None]
        equity = None if unknown else cash + sum(t['invested'] + t['pnl'] for t in held)
        ledger.append(dict(date=days[i], end_cash=cash, equity=equity, holdings=len(held)))
        if cash < -1e-6:
            raise ValueError('현금이 음수입니다: ' + days[i])
    return dict(settings=s.asdict(), initial=initial, start=days[start_i], trades=trades, ledger=ledger)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input')
    ap.add_argument('--start')
    ap.add_argument('--settings', help='JSON, e.g. {"take":10,"stop":5}')
    ap.add_argument('--out')
    a = ap.parse_args()
    over = json.loads(a.settings or '{}')
    initial = over.pop('initial', 20_000_000)
    result = replay(load_input(a.input), Settings(**over), initial=initial, start=a.start)
    text = json.dumps(result, ensure_ascii=False)
    if a.out:
        Path(a.out).write_text(text, encoding='utf-8')
    else:
        print(text)


if __name__ == '__main__':
    main()
