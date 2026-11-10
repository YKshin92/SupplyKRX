"""장중 수동 매수(가상 체결 모드 전용) — 대기 신호 하나를 지금 가격으로 산다. 규칙(다음 날 시가) 밖의 매수라 장부에 '수동'으로 남긴다.

먼저 돌고 있는 봇을 멈춰야 한다(같은 장부를 두 프로세스가 쓰면 덮어쓴다):
  Stop-ScheduledTask -TaskName 'SupplyKRX Trader'
  & $py -X utf8 -m trader.manual_buy 456010
  Start-ScheduledTask -TaskName 'SupplyKRX Trader'
모의(paper)·실전(live) 모드에서는 동작하지 않는다(실제 주문 경로는 아직 확인 전).
"""
from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path

from .book import load, save, start_day, held_codes, log
from .bot import DEFAULT_STATE
from .rules import size_buy
from .run import KST, Clock, Config, build


def main():
    ap = argparse.ArgumentParser(description='대기 신호 하나를 지금 가격으로 가상 매수(가상 체결 모드 전용)')
    ap.add_argument('code')
    ap.add_argument('--state', default=str(DEFAULT_STATE))
    a = ap.parse_args()
    state = Path(a.state)
    cfg = Config.load(state / 'config.json')
    if cfg.mode != 'shadow':
        raise SystemExit(f'수동 매수는 가상 체결(shadow) 모드에서만 됩니다(지금 {cfg.mode}).')
    day = build(cfg, state, Clock())
    if day.stopped():
        raise SystemExit('긴급 정지 중이라 매수하지 않습니다(PC STOP 파일 또는 사이트 버튼).')
    book = load(day.book_path)
    today = datetime.now(KST).date().isoformat()
    start_day(book, today)
    t = next((p for p in book['pending'] if p['code'] == a.code), None)
    if t is None:
        raise SystemExit(f"{a.code} 가 대기 신호에 없습니다(대기: {[p['code'] for p in book['pending']]}).")
    if a.code in held_codes(book):
        raise SystemExit(f'{a.code} 는 이미 보유 중입니다.')
    q = day.broker.quote(a.code)
    if not q.price:
        raise SystemExit('현재가를 받지 못했습니다(장 시간·연결 확인).')
    cash = day.broker.cash()
    base = book['equity_prev_close'] or cash
    shares, cost, why = size_buy(q.price, cash, base, day.s)
    if not shares:
        raise SystemExit(f'살 수 없음: {why}')
    if book['day']['bought'] + cost > cfg.daily_max_buy + 1e-7:
        raise SystemExit('하루 최대 매수 금액을 넘습니다.')
    fill = day.broker.buy(a.code, shares, reference=q.price)
    book['day']['bought'] += fill.amount
    book['positions'][a.code] = dict(code=a.code, name=t['name'], shares=fill.shares, entry_price=fill.price, invested=fill.amount,
                                     entry_date=today, signal_date=t['signal_date'], signal_net=t['signal_net'], score=t['score'],
                                     flow_flag=None, manual=True)
    book['pending'] = [p for p in book['pending'] if p['code'] != a.code]
    log(book, 'buy', date=today, code=a.code, shares=fill.shares, price=fill.price, amount=fill.amount, signal_date=t['signal_date'],
        reason='수동 장중 매수(규칙 밖 · 사용자 요청)')
    save(book, day.book_path)
    day.publish(book, {a.code: q.price})
    print(f"가상 매수: {t['name']}({a.code}) {fill.shares}주 × {fill.price:,.0f}원 = {fill.amount:,.0f}원 · 남은 가상 현금 {day.broker.cash():,.0f}원")


if __name__ == '__main__':
    main()
