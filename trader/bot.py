"""봇의 하루: 장 시작(매수·시가 청산) → 장중 가격 감시(손절·익절) → 장 마감 후(연기금 순매도 확인·평가자산·새 신호).

각 단계는 장부(book)와 증권사(broker)만 받는 함수라서, 같은 함수를 가상 계좌(DryRunBroker)로 과거 일봉에 돌려 시뮬레이션과 대조한다
(tests/test_trader.py). 안전장치: 긴급 정지(새 주문을 멈추고 보유는 그대로), 하루 최대 매수 금액.
usage: python -m trader.bot status|stop|resume [--state DIR]
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

from .book import load, save, start_day, held_codes, log
from .broker import Broker
from .rules import Settings, queue_order, size_buy, open_gap_problem, exit_at_open, exit_on_price, flow_exit_due, positive

DEFAULT_STATE = Path.home() / '.supplykrx-trader'


@dataclass(frozen=True)
class Risk:
    daily_max_buy: float          # 하루 매수 합계 상한(원). 0이면 매수하지 않음
    stopped: bool = False         # 긴급 정지: 새 매수·매도 주문을 내지 않는다(보유는 그대로 두고 알림)


def stop_file(state: Path) -> Path:
    return Path(state) / 'STOP'


def is_stopped(state: Path) -> bool:
    return stop_file(state).exists()


def _close(book: dict, code: str, fill, status: str, reason: str, today: str) -> dict:
    pos = book['positions'].pop(code)
    trade = dict(pos, status=status, reason=reason, exit_date=today, exit_price=fill.price, proceeds=fill.amount,
                 pnl=round((fill.amount - pos['invested']) * 1e4) / 1e4)
    book['trades'].append(trade)
    log(book, 'sell', date=today, code=code, shares=fill.shares, price=fill.price, amount=fill.amount, status=status, reason=reason)
    return trade


def at_open(book: dict, broker: Broker, today: str, s: Settings, risk: Risk) -> list[dict]:
    """장 시작 직후. 시뮬레이션처럼 매수를 먼저(대기 신호, 점수 순) 하고 같은 날 매도 대금은 쓰지 않는다. 그다음 보유 종목 시가 청산."""
    start_day(book, today)
    events = []
    if risk.stopped:
        log(book, 'stopped', date=today, reason='긴급 정지 중 · 새 주문 없음')
        return events
    held = held_codes(book)
    cash = broker.cash()
    base = book['equity_prev_close']
    if base is None:
        base = cash + sum(p['shares'] * (broker.quote(c).prev_close or p['entry_price']) for c, p in book['positions'].items()) + sum(h['invested'] for h in book['halted'].values())
    keep = []
    for t in queue_order(book['pending']):
        if t['code'] in held:
            log(book, 'skip', date=today, code=t['code'], signal_date=t['signal_date'], reason='이미 보유 중인 종목 · 추가 매수 제외')
            continue
        q = broker.quote(t['code'])
        problem = open_gap_problem(q.open, q.prev_close, s)
        if problem:
            keep.append(dict(t, reason=problem + ' · 다음 거래일 재검토'))
            continue
        shares, cost, why = size_buy(q.open, cash, base, s)
        if not shares:
            keep.append(dict(t, reason=why))
            continue
        if book['day']['bought'] + cost > risk.daily_max_buy + 1e-7:
            keep.append(dict(t, reason='하루 최대 매수 금액 초과 · 다음 거래일 재검토'))
            continue
        fill = broker.buy(t['code'], shares, reference=q.open)
        if fill is None:
            keep.append(dict(t, reason='주문이 접수되지 않음 · 다음 거래일 재검토'))
            continue
        held.add(t['code'])
        cash -= fill.amount
        book['day']['bought'] += fill.amount
        book['positions'][t['code']] = dict(code=t['code'], name=t['name'], shares=fill.shares, entry_price=fill.price, invested=fill.amount,
                                            entry_date=today, signal_date=t['signal_date'], signal_net=t['signal_net'], score=t['score'], flow_flag=None)
        events.append(log(book, 'buy', date=today, code=t['code'], shares=fill.shares, price=fill.price, amount=fill.amount, signal_date=t['signal_date']))
    book['pending'] = keep
    for code, pos in list(book['positions'].items()):
        if pos['entry_date'] == today:
            continue  # 오늘 시가에 산 종목은 시가 청산 대상이 아니다(장중 감시는 함)
        q = broker.quote(code)
        if positive(q.open) and positive(q.prev_close) and abs(q.open / q.prev_close - 1) > s.max_open_gap:
            # 기업행사(분할·병합 등)로 보이는 가격 단절: 자동 주문을 멈추고 사용자가 확인하게 한다.
            book['halted'][code] = dict(book['positions'].pop(code), reason=f'{today} 시가 단절 · 기업행사 확인 필요')
            events.append(log(book, 'halt', date=today, code=code, reason='시가 단절 · 자동 주문 중지'))
            continue
        if not positive(q.open):
            continue
        hit = exit_at_open(pos['entry_price'], q.open, bool(pos['flow_flag']), s)
        if hit:
            status, price, reason = hit
            fill = broker.sell(code, pos['shares'], reference=price)
            if fill:
                events.append(_close(book, code, fill, status, reason, today))
    return events


def on_price(book: dict, broker: Broker, today: str, code: str, price: float, s: Settings, risk: Risk) -> dict | None:
    """장중 가격 하나를 받았을 때. 손절선 이하·익절선 이상이면 전량 매도."""
    pos = book['positions'].get(code)
    if pos is None or risk.stopped or not positive(price):
        return None
    hit = exit_on_price(pos['entry_price'], price, s)
    if not hit:
        return None
    status, ref, reason = hit
    fill = broker.sell(code, pos['shares'], reference=ref)
    return _close(book, code, fill, status, reason, today) if fill else None


def after_close(book: dict, broker: Broker, today: str, closes: dict[str, float], pension_sells: dict[str, float], s: Settings) -> list[str]:
    """장 마감·자료 갱신 후. 연기금 순매도가 신호일 순매수보다 큰 보유 종목은 다음 거래일 시가 매도로 예약하고, 내일 주문 크기의 기준(평가자산)을 남긴다."""
    flagged = []
    for code, pos in book['positions'].items():
        if pos['flow_flag'] is None and flow_exit_due(pos, pension_sells.get(code), s):
            pos['flow_flag'] = today
            flagged.append(code)
            log(book, 'flow_flag', date=today, code=code, reason='연기금 순매도 > 신호일 순매수 · 다음 거래일 시가 매도 예약')
    book['equity_prev_close'] = broker.cash() + sum(p['shares'] * closes[c] for c, p in book['positions'].items()) + sum(h['invested'] for h in book['halted'].values())
    return flagged


def main():
    ap = argparse.ArgumentParser(description='SupplyKRX 자동매매 봇 관리')
    ap.add_argument('command', choices=['status', 'stop', 'resume'])
    ap.add_argument('--state', default=str(DEFAULT_STATE))
    a = ap.parse_args()
    state = Path(a.state)
    if a.command == 'stop':
        state.mkdir(parents=True, exist_ok=True)
        stop_file(state).write_text('긴급 정지\n', encoding='utf-8')
        print('긴급 정지: 새 주문을 내지 않습니다. 보유 종목은 그대로입니다.')
    elif a.command == 'resume':
        stop_file(state).unlink(missing_ok=True)
        print('정지를 풀었습니다.')
    else:
        book = load(state / 'book.json')
        print(f"정지: {'예' if is_stopped(state) else '아니오'} · 보유 {len(book['positions'])} · 확인 필요 {len(book['halted'])} · 대기 신호 {len(book['pending'])} · 청산 {len(book['trades'])}")
        for p in book['positions'].values():
            print(f"  {p['code']} {p['name']} {p['shares']}주 @ {p['entry_price']:,.0f} ({p['entry_date']}){' · 내일 시가 매도 예약' if p['flow_flag'] else ''}")


if __name__ == '__main__':
    main()
