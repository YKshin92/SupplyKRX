"""봇 하루 실행기 — PC(Windows 작업 스케줄러)가 평일 아침에 켜면 그날 장이 끝날 때까지 돈다.

순서(한국 시간):
  1) 켜지면: 장부·설정을 읽고, 계좌와 장부를 맞춰 보고, 어제 신호 공급 파일(feed)을 아직 반영 안 했으면 반영한다.
  2) 09:00:30 장 시작: 대기 신호 시가 매수(점수 순) → 보유 종목 시가 청산(연기금 매도 예약·갭). 09:10 이후에 켜졌으면 매수는 건너뛰고
     (대기 신호는 다음 거래일 시가에) 청산만 한다.
  3) ~15:20 장중: poll_seconds 마다 보유 종목 가격을 보고 손절·익절. 주문 직전마다 긴급 정지(PC의 STOP 파일·사이트 버튼)를 확인한다.
  4) 15:30 이후: 오늘 feed(16시 수집 뒤 생김)를 기다려 연기금 순매도 확인·평가자산 기록·새 신호를 넣고 끝낸다. 늦게까지 없으면 그냥
     끝내고 다음 날 아침 1)에서 반영한다.
상태는 5분마다와 일이 생길 때 사이트 '자동매매' 탭으로 보낸다(trading/state.json).

모드: dry-run(가상 가격·가상 체결, 시험용), shadow(나무 PLUG 실제 시세 + PC 안 가상 체결 — 주문 없음, 처음 연결 시험용),
      paper(모의투자 서버 주문), live(실전 — 설정과 환경 변수 두 곳을 사용자가 직접 맞춰야 열림, trader/broker.py check_target).
usage: python -m trader.run [--config %USERPROFILE%\\.supplykrx-trader\\config.json] [--once-now]
"""
from __future__ import annotations

import argparse
import json
import time
import traceback
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .book import load, save, log, start_day
from .bot import DEFAULT_STATE, Risk, at_open, on_price, after_close, is_stopped
from .broker import DryRunBroker, Quote
from .feed import check_feed, pension_sells, add_feed_signals, missed_flow_flags
from .report import build_state
from .rules import Settings
from .sync import STATE

KST = timezone(timedelta(hours=9))  # 한국은 서머타임이 없다(Windows 에 시간대 자료가 없어도 동작)
FEED = 'trading/feed.json'


@dataclass
class Config:
    mode: str = 'shadow'
    account: str = ''
    account_type: str = '03'
    daily_max_buy: float = 10_000_000
    initial_cash: float = 20_000_000      # dry-run·shadow 가상 계좌 시작 현금
    poll_seconds: int = 20
    report_minutes: int = 5
    open_at: str = '09:00:30'
    late_buy_cutoff: str = '09:10:00'
    watch_until: str = '15:20:00'
    feed_deadline: str = '21:30:00'
    stale_after: int = 5
    settings: dict = field(default_factory=dict)

    @classmethod
    def load(cls, path: Path) -> 'Config':
        raw = json.loads(path.read_text(encoding='utf-8-sig')) if path.exists() else {}  # Windows 메모장 BOM 허용
        unknown = set(raw) - set(cls.__dataclass_fields__)
        if unknown:
            raise ValueError(f'설정에 모르는 항목이 있습니다: {sorted(unknown)}')
        cfg = cls(**raw)
        if cfg.mode not in ('dry-run', 'shadow', 'paper', 'live'):
            raise ValueError(f'mode 는 dry-run/shadow/paper/live 중 하나여야 합니다: {cfg.mode}')
        if cfg.daily_max_buy < 0 or cfg.poll_seconds < 5:
            raise ValueError('daily_max_buy 는 0 이상, poll_seconds 는 5초 이상이어야 합니다.')
        return cfg


class Clock:
    def now(self) -> datetime:
        return datetime.now(KST)

    def sleep(self, seconds: float) -> None:
        time.sleep(max(0.0, seconds))


def at_time(day: datetime, hhmmss: str) -> datetime:
    h, m, s = (int(x) for x in hhmmss.split(':'))
    return day.replace(hour=h, minute=m, second=s, microsecond=0)


class ShadowBroker(DryRunBroker):
    """실제 시세(quote_source = PLUG 시세 조회) + PC 안 가상 체결. 가상 현금·보유는 state 폴더의 shadow.json 에 남아 다음 날로 이어진다."""
    def __init__(self, path: Path, starting_cash: float, quote_source, s: Settings):
        super().__init__(starting_cash, s.buy_cost, s.sell_cost)
        self.path, self._source, self.mode = Path(path), quote_source, 'shadow'
        if self.path.exists():
            state = json.loads(self.path.read_text(encoding='utf-8'))
            self._cash, self._held = float(state['cash']), {k: int(v) for k, v in state['held'].items()}

    def quote(self, code):
        return self._source(code)

    def _keep(self):
        tmp = self.path.with_suffix('.tmp')
        tmp.write_text(json.dumps(dict(cash=self._cash, held=self._held)), encoding='utf-8')
        tmp.replace(self.path)

    def buy(self, code, shares, *, reference):
        fill = super().buy(code, shares, reference=reference)
        self._keep()
        return fill

    def sell(self, code, shares, *, reference):
        fill = super().sell(code, shares, reference=reference)
        self._keep()
        return fill


def reconcile(book: dict, broker) -> list[str]:
    """계좌 보유와 장부가 다르면 문제 목록. 다르면 그날 새 매수를 하지 않는다(사람이 확인)."""
    want = {c: p['shares'] for c, p in book['positions'].items()}
    want.update({c: h['shares'] for c, h in book['halted'].items()})
    have = broker.holdings()
    issues = [f'{c}: 장부 {want.get(c, 0)}주 / 계좌 {have.get(c, 0)}주' for c in sorted(set(want) | set(have)) if want.get(c, 0) != have.get(c, 0)]
    return issues


@dataclass
class Day:
    cfg: Config
    state_dir: Path
    broker: object
    mailbox: object | None
    clock: Clock
    s: Settings
    alerts: list = field(default_factory=list)

    @property
    def book_path(self):
        return self.state_dir / 'book.json'

    def stopped(self) -> bool:
        if is_stopped(self.state_dir):
            return True
        return bool(self.mailbox and self.mailbox.remote_stopped())

    def feed(self):
        if not self.mailbox:
            return None
        try:
            data, _ = self.mailbox.get_json(FEED)
            return check_feed(data) if data else None
        except Exception as e:  # 공급 파일을 못 읽어도 보유 종목 손절·익절 감시는 계속한다
            self.alerts.append(f'신호 공급 파일을 읽지 못함: {e}')
            return None

    def publish(self, book: dict, prices: dict | None = None) -> None:
        if not self.mailbox:
            return
        try:
            st = build_state(book, cash=self.broker.cash(), prices=prices or {}, mode=self.cfg.mode, stopped=self.stopped(),
                             settings=self.s, daily_max_buy=self.cfg.daily_max_buy, initial=book.get('initial') or self.cfg.initial_cash)
            st['alerts'] = self.alerts[-20:]
            self.mailbox.put_json(STATE, st, f"trading: state {st['updated_at']}")
        except Exception as e:
            self.alerts.append(f'상태 보내기 실패: {e}')

    def apply_feed(self, book: dict, feed: dict, closes: dict[str, float]) -> None:
        """그날(feed.as_of) 장 마감 처리: 놓친 날의 연기금 순매도 → 당일 순매도 확인·평가자산 → 새 신호."""
        missed_flow_flags(book, feed, self.s, book.get('feed_applied'))
        after_close(book, self.broker, feed['as_of'], closes, pension_sells(feed, feed['as_of']), self.s)
        added = add_feed_signals(book, feed, stale_after=self.cfg.stale_after)
        book['feed_applied'] = feed['as_of']
        log(book, 'feed', date=feed['as_of'], reason=f'신호 공급 반영 · 새 대기 신호 {len(added)}건')

    def run(self) -> dict:
        now = self.clock.now()
        today = now.date().isoformat()
        if now.weekday() >= 5:
            return dict(day=today, skipped='주말')
        book = load(self.book_path)
        book.setdefault('initial', self.cfg.initial_cash)
        start_day(book, today)
        issues = reconcile(book, self.broker)
        if issues:
            self.alerts.append('계좌와 장부가 다름 → 오늘 새 매수 안 함: ' + '; '.join(issues))
        # 1) 지난 거래일 공급 파일을 아직 반영 안 했으면(어제 PC가 일찍 꺼짐 등) 지금 반영. 종가는 전일 종가(prev_close)로.
        feed = self.feed()
        if feed and feed['as_of'] < today and feed['as_of'] != book.get('feed_applied'):
            closes = {c: self.broker.quote(c).prev_close or p.get('last_close') or p['entry_price'] for c, p in book['positions'].items()}
            self.apply_feed(book, feed, closes)
        save(book, self.book_path); self.publish(book)
        # 2) 장 시작
        open_at = at_time(now, self.cfg.open_at)
        if self.clock.now() < open_at:
            self.clock.sleep((open_at - self.clock.now()).total_seconds())
        late = self.clock.now() > at_time(now, self.cfg.late_buy_cutoff)
        if self.clock.now() <= at_time(now, self.cfg.watch_until):
            at_open(book, self.broker, today, self.s, Risk(self.cfg.daily_max_buy, self.stopped()), buys=not late and not issues)
            save(book, self.book_path); self.publish(book)
        # 3) 장중 감시
        last_report = self.clock.now()
        while self.clock.now() <= at_time(now, self.cfg.watch_until):
            risk = Risk(self.cfg.daily_max_buy, self.stopped())
            prices, changed = {}, False
            for code in list(book['positions']):
                q = self.broker.quote(code)
                prices[code] = q.price
                if q.price and on_price(book, self.broker, today, code, q.price, self.s, risk):
                    changed = True
            if changed or (self.clock.now() - last_report).total_seconds() >= self.cfg.report_minutes * 60:
                save(book, self.book_path); self.publish(book, prices); last_report = self.clock.now()
            self.clock.sleep(self.cfg.poll_seconds)
        # 4) 장 마감 뒤: 오늘 공급 파일을 기다린다.
        deadline = at_time(now, self.cfg.feed_deadline)
        while self.clock.now() <= deadline:
            feed = self.feed()
            if feed and feed['as_of'] == today:
                closes = {c: self.broker.quote(c).price or p['entry_price'] for c, p in book['positions'].items()}
                self.apply_feed(book, feed, closes)
                break
            self.clock.sleep(300)
        save(book, self.book_path); self.publish(book)
        return dict(day=today, positions=len(book['positions']), pending=len(book['pending']), trades=len(book['trades']),
                    feed_applied=book.get('feed_applied'), alerts=list(self.alerts))


def build(cfg: Config, state_dir: Path, clock: Clock):
    """설정 모드에 맞는 증권사·우편함을 만든다. 키·토큰은 PC의 ~/.nhplug/.env 와 환경 변수에서만 읽는다."""
    from .sync import Mailbox
    s = Settings(**cfg.settings)
    mailbox = Mailbox()
    if cfg.mode == 'dry-run':
        raise SystemExit('dry-run 은 시험(tests/test_trader_run.py) 전용입니다. PC에서는 shadow 부터 쓰세요.')
    from .broker import PlugBroker
    from nhplug.auth import get_base_url  # SDK가 ~/.nhplug/.env 를 읽음
    plug_mode = 'paper' if cfg.mode == 'shadow' else cfg.mode
    plug = PlugBroker(mode=plug_mode, account=cfg.account, account_type=cfg.account_type, base_url=get_base_url())
    broker = ShadowBroker(state_dir / 'shadow.json', cfg.initial_cash, plug.quote, s) if cfg.mode == 'shadow' else plug
    return Day(cfg, state_dir, broker, mailbox, clock, s)


def main():
    ap = argparse.ArgumentParser(description='SupplyKRX 자동매매 봇 하루 실행')
    ap.add_argument('--state', default=str(DEFAULT_STATE))
    ap.add_argument('--config')
    a = ap.parse_args()
    state = Path(a.state)
    state.mkdir(parents=True, exist_ok=True)
    cfg = Config.load(Path(a.config) if a.config else state / 'config.json')
    log_path = state / 'logs' / f"{datetime.now(KST).date().isoformat()}.log"
    log_path.parent.mkdir(exist_ok=True)
    try:
        result = build(cfg, state, Clock()).run()
        text = json.dumps(result, ensure_ascii=False)
    except Exception:
        text = traceback.format_exc()
        raise
    finally:
        with log_path.open('a', encoding='utf-8') as f:
            f.write(f"{datetime.now(KST).isoformat(timespec='seconds')} {text if 'text' in locals() else ''}\n")
    print(text)


if __name__ == '__main__':
    main()
