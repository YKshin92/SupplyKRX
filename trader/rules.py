"""매매 규칙 — 사이트 시뮬레이션(src/simulation-engine.ts, 자본 모드·percent 크기·minBuy·비용·flowExit)과 같은 규칙.

리플레이(trader/replay.py, 과거 일봉으로 시뮬레이션과 대조)와 실제 봇(trader/bot.py)이 이 함수들을 함께 쓴다.
여기에는 주문·네트워크 호출이 없다. 기업행사(분할·무상증자) 정산과 쉬는 현금 ETF는 아직 다루지 않는다.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, asdict


@dataclass(frozen=True)
class Settings:
    take: float = 30.0          # 익절선: 매수가 대비 +%
    stop: float = 10.0          # 손절선: 매수가 대비 −%
    percent: float = 25.0       # 주문 크기: 전날 종가 기준 평가자산의 %
    min_buy: float = 3_000_000  # 최소 매수금액(현금이 모자라면 남은 현금으로 사되 이 금액 이상일 때만)
    buy_cost: float = 0.015     # 매수 수수료 %(원가에 포함)
    sell_cost: float = 0.215    # 매도 수수료+거래세 %(매도대금에서 차감)
    flow_exit: bool = True      # 보유 중 연기금 순매도 > 신호일 순매수면 다음 거래일 시가 전량 매도
    max_open_gap: float = 0.35  # 시가가 전날 종가 대비 ±35% 넘게 벌어지면 그날은 사지 않음(시가 단절)

    def asdict(self) -> dict:
        return asdict(self)


def positive(v) -> bool:
    return v is not None and isinstance(v, (int, float)) and math.isfinite(v) and v > 0


def signal_passes(sig: dict) -> bool:
    """운영 신호 조건(quiet3m-volume): 3개월 무매수(매도 합계 1억 미만, 2026-11-04부터) + 신호일 거래량 20일 평균 3배 이하. 순매수 3억 이상은 입력 단계에서 걸러져 있다."""
    vr = sig.get('volume_ratio_20')
    return sig.get('quiet_3m') is True and vr is not None and vr <= 3


def queue_order(pending: list[dict]) -> list[dict]:
    """같은 날 살 후보의 순서: 신호일 수급 점수 높은 순 → 신호일 빠른 순 → 종목코드."""
    return sorted(pending, key=lambda t: (-(t['score'] if t.get('score') is not None else -1), t['signal_date'], t['code']))


def target_amount(equity_prev_close: float, s: Settings) -> float:
    return equity_prev_close * s.percent / 100


def size_buy(open_price: float, cash: float, equity_prev_close: float, s: Settings) -> tuple[int, float, str | None]:
    """시가 매수 수량. (주식 수, 원가, 못 사는 이유). 전체 주문이 현금 안에 들어오면 전부, 아니면 남은 현금이 최소금액 이상일 때 그만큼."""
    unit = open_price * (1 + s.buy_cost / 100)
    want = max(target_amount(equity_prev_close, s), s.min_buy)
    shares = math.floor(want / unit)
    if shares * unit > cash + 1e-7:
        if cash < s.min_buy - 1e-7:
            return 0, 0.0, '현금이 최소 매수금액보다 적음 · 매도 대금 재사용 대기'
        if cash < unit:
            return 0, 0.0, '남은 현금으로 1주도 살 수 없음 · 대기'
        shares = math.floor(cash / unit)
    if not shares:
        return 0, 0.0, '1주 가격이 매수 한도 초과 · 대기'
    return shares, shares * unit, None


def open_gap_problem(open_price, prev_close, s: Settings) -> str | None:
    if not positive(open_price):
        return '시가 미확인'
    if positive(prev_close) and abs(open_price / prev_close - 1) > s.max_open_gap:
        return '시가 단절'
    return None


def levels(entry: float, s: Settings) -> tuple[float, float]:
    """(익절선, 손절선)"""
    return entry * (1 + s.take / 100), entry * (1 - s.stop / 100)


def exit_at_open(entry: float, open_price: float, flow_flagged: bool, s: Settings) -> tuple[str, float, str] | None:
    """장 시작(시가)에 바로 파는 경우: 연기금 순매도 청산 예약, 손절선 아래 갭, 익절선 위 갭."""
    upper, lower = levels(entry, s)
    if flow_flagged:
        return 'flow', open_price, '연기금 순매도가 신호일 순매수보다 커서 시가 전량 매도'
    if open_price <= lower:
        return 'stop', open_price, '손절선 아래 갭 시가 청산'
    if open_price >= upper:
        return 'take', open_price, '익절선 위 갭 시가 청산'
    return None


def exit_on_price(entry: float, price: float, s: Settings) -> tuple[str, float, str] | None:
    """장중 가격 하나로 판단(실제 봇). 손절선 이하이면 손절, 익절선 이상이면 익절."""
    upper, lower = levels(entry, s)
    if price <= lower:
        return 'stop', lower, '장중 손절선 도달'
    if price >= upper:
        return 'take', upper, '장중 익절선 도달'
    return None


def exit_on_bar(entry: float, bar: dict, flow_flagged: bool, s: Settings) -> tuple[str, float, str] | None:
    """일봉 하나로 판단(리플레이). 같은 날 양쪽 도달이면 손절 우선 — 시뮬레이션과 같다."""
    hit = exit_at_open(entry, bar['open'], flow_flagged, s)
    if hit:
        return hit
    upper, lower = levels(entry, s)
    if bar['high'] >= upper and bar['low'] <= lower:
        return 'stop', lower, '같은 날 양쪽 도달 · 손절 우선'
    if bar['low'] <= lower:
        return 'stop', lower, '장중 손절선 도달'
    if bar['high'] >= upper:
        return 'take', upper, '장중 익절선 도달'
    return None


def sale_pnl(shares: int, price: float, invested: float, s: Settings) -> float:
    """매도 손익(매도 비용 차감). 시뮬레이션처럼 1e-4 단위로 반올림."""
    return round((shares * price * (1 - s.sell_cost / 100) - invested) * 1e4) / 1e4


def flow_exit_due(position: dict, pension_net_sell: float | None, s: Settings) -> bool:
    """오늘 연기금 순매도가 이 종목 신호일 순매수보다 크면 다음 거래일 시가에 판다."""
    return s.flow_exit and (pension_net_sell or 0) > position['signal_net']


def price_problem(previous: dict | None, r: dict | None) -> str | None:
    """시뮬레이션 priceProblem과 같은 일봉 점검. 실제 봇에서는 이런 날 그 종목 자동 주문을 멈추고 알린다."""
    if not r or any(r.get(k) is None for k in ('open', 'high', 'low', 'close')):
        return '일봉 가격 미수집'
    if r.get('volume') is None:
        return '거래량 미수집'
    if r['volume'] == 0:
        return '거래량 0 · 체결 가능 여부 미확인'
    o, h, l, c = r['open'], r['high'], r['low'], r['close']
    if not all(positive(v) for v in (o, h, l, c, r['volume'])) or l > min(o, c) or h < max(o, c):
        return '일봉 가격 범위 미확인'
    if previous and positive(previous.get('close')):
        change = (c / previous['close'] - 1) * 100
        cp = r.get('change_pct')
        if abs(change) > 35 or abs(o / previous['close'] - 1) > .35 or (cp is not None and abs(change - cp) > 5):
            return '가격 단절 · 기업행사 확인 필요'
    return None
