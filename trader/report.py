"""사이트 '자동매매' 메뉴에 보낼 상태 문서 하나(trading/state.json)를 만든다 — 현재 잔고 · 거래내역 · 매매 성과.

계좌번호·키는 넣지 않는다. 문서는 비공개 저장소의 trading-state 가지에만 올라가고, 사이트에서는 관리자만 읽는다.
"""
from __future__ import annotations

from datetime import datetime, timezone

from .rules import Settings, levels

SCHEMA = 1


def _round(v, n=0):
    return None if v is None else round(v, n)


def max_drawdown(values: list[float]) -> float | None:
    peak, worst = None, 0.0
    for v in values:
        peak = v if peak is None or v > peak else peak
        if peak:
            worst = min(worst, v / peak - 1)
    return None if peak is None else worst * 100


def build_state(book: dict, *, cash: float, prices: dict[str, float], mode: str, stopped: bool, settings: Settings,
                daily_max_buy: float, initial: float | None = None, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    positions = []
    for code, p in sorted(book['positions'].items()):
        price = prices.get(code) or p.get('last_close')
        value = p['shares'] * price if price else None
        take, stop = levels(p['entry_price'], settings)
        positions.append(dict(code=code, name=p['name'], shares=p['shares'], entry_date=p['entry_date'], entry_price=p['entry_price'],
                              invested=_round(p['invested']), price=price, value=_round(value),
                              pnl=_round(value - p['invested']) if value is not None else None,
                              return_pct=_round((value / p['invested'] - 1) * 100, 2) if value is not None else None,
                              take_price=_round(take), stop_price=_round(stop), signal_date=p['signal_date'],
                              sell_at_next_open=bool(p.get('flow_flag'))))
    halted = [dict(code=c, name=h['name'], shares=h['shares'], invested=_round(h['invested']), reason=h.get('reason')) for c, h in sorted(book['halted'].items())]
    held_value = sum(p['value'] or 0 for p in positions) + sum(h['invested'] or 0 for h in halted)
    equity = cash + held_value
    closed = [dict(code=t['code'], name=t['name'], signal_date=t['signal_date'], entry_date=t['entry_date'], entry_price=t['entry_price'],
                   exit_date=t['exit_date'], exit_price=t['exit_price'], shares=t['shares'], invested=_round(t['invested']), pnl=_round(t['pnl']),
                   return_pct=_round(t['pnl'] / t['invested'] * 100, 2), status=t['status'], reason=t['reason']) for t in book['trades']]
    history = book.get('equity_history', [])
    base = initial if initial else (history[0]['equity'] if history else None)
    wins = [t for t in closed if t['pnl'] > 0]
    curve = [h['equity'] for h in history]
    return dict(
        schema=SCHEMA, updated_at=now.isoformat(timespec='seconds'), mode=mode, stopped=stopped,
        settings=settings.asdict(), daily_max_buy=daily_max_buy, bought_today=_round((book.get('day') or {}).get('bought', 0)),
        balance=dict(cash=_round(cash), equity=_round(equity), held_value=_round(held_value),
                     unrealized=_round(sum(p['pnl'] or 0 for p in positions)), positions=positions, halted=halted,
                     pending=[dict(code=t['code'], name=t['name'], signal_date=t['signal_date'], score=t['score'], reason=t.get('reason')) for t in book['pending']]),
        history=dict(closed=list(reversed(closed)), orders=list(reversed(book['orders'][-300:]))),
        performance=dict(
            start=history[0]['date'] if history else None, base=_round(base),
            return_pct=_round((equity / base - 1) * 100, 2) if base else None,
            realized=_round(sum(t['pnl'] for t in closed)), closed=len(closed), wins=len(wins),
            win_rate=_round(len(wins) / len(closed) * 100, 1) if closed else None,
            avg_return_pct=_round(sum(t['return_pct'] for t in closed) / len(closed), 2) if closed else None,
            mdd_pct=_round(max_drawdown(curve), 2) if curve else None,
            equity=[dict(date=h['date'], equity=_round(h['equity']), cash=_round(h['cash'])) for h in history]),
    )
