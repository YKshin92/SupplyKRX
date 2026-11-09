"""증권사 연결. 봇은 이 인터페이스만 쓴다.

- DryRunBroker: 주문을 보내지 않고 PC 안에서만 체결을 흉내 낸다(시험·리플레이 대조용).
- PlugBroker: 나무 PLUG(NH투자증권 OpenAPI). 공식 SDK(nhplug)의 call()로 호출하고, 키는 SDK가 PC의 ~/.nhplug/.env에서 읽는다.
  기본은 모의투자 서버(moapi)와 모의 계좌(유형 03)만 허용한다. 실전은 설정 mode='live'와 환경 변수 TRADER_LIVE_ACCOUNT=<계좌번호>를
  사용자가 둘 다 직접 맞춰야 열린다(한쪽만 바뀌면 시작하지 않음).
  ⚠️ 응답 필드 해석(시세·잔고·체결)은 모의투자 키를 받은 뒤 실제 응답으로 확인해야 한다 — 그 전에는 주문 경로를 쓰지 않는다.
"""
from __future__ import annotations

import math
import os
from dataclasses import dataclass, field
from typing import Protocol
from urllib.parse import urlparse


@dataclass
class Quote:
    code: str
    price: float | None          # 현재가
    open: float | None = None    # 오늘 시가(장 시작 전이면 None)
    prev_close: float | None = None


@dataclass
class Fill:
    code: str
    side: str        # 'buy' | 'sell'
    shares: int
    price: float     # 체결 단가
    amount: float    # 수수료·세금 반영 금액(매수=지불액, 매도=받은 금액)
    order_id: str | None = None


class Broker(Protocol):
    mode: str
    def cash(self) -> float: ...
    def holdings(self) -> dict[str, int]: ...
    def quote(self, code: str) -> Quote: ...
    def buy(self, code: str, shares: int, *, reference: float) -> Fill | None: ...
    def sell(self, code: str, shares: int, *, reference: float) -> Fill | None: ...


@dataclass
class DryRunBroker:
    """가상 계좌. quotes는 시험에서 바꿔 넣는다. 체결가는 봇이 넘긴 기준가(시가·손절선·익절선)로 둔다."""
    starting_cash: float
    buy_cost: float = 0.015
    sell_cost: float = 0.215
    quotes: dict[str, Quote] = field(default_factory=dict)
    mode: str = 'dry-run'

    def __post_init__(self):
        self._cash = float(self.starting_cash)
        self._held: dict[str, int] = {}
        self.fills: list[Fill] = []

    def cash(self) -> float:
        return self._cash

    def holdings(self) -> dict[str, int]:
        return dict(self._held)

    def quote(self, code: str) -> Quote:
        return self.quotes.get(code) or Quote(code, None)

    def buy(self, code, shares, *, reference):
        amount = shares * reference * (1 + self.buy_cost / 100)
        if shares <= 0 or amount > self._cash + 1e-7:
            return None
        self._cash -= amount
        self._held[code] = self._held.get(code, 0) + shares
        fill = Fill(code, 'buy', shares, reference, amount)
        self.fills.append(fill)
        return fill

    def sell(self, code, shares, *, reference):
        if shares <= 0 or self._held.get(code, 0) < shares:
            return None
        amount = shares * reference * (1 - self.sell_cost / 100)
        self._cash += amount
        self._held[code] -= shares
        if not self._held[code]:
            del self._held[code]
        fill = Fill(code, 'sell', shares, reference, amount)
        self.fills.append(fill)
        return fill


PAPER_HOSTS = {'moapi.nhplug.com', 'moapi.n2plug.com'}
LIVE_HOSTS = {'api.nhplug.com', 'api.n2plug.com'}


class LiveGuardError(RuntimeError):
    pass


def check_target(mode: str, base_url: str, account: str, account_type: str, env=os.environ) -> None:
    """주문 대상이 설정과 맞는지 시작할 때 확인한다. 어긋나면 아무 주문도 하지 않고 멈춘다."""
    host = urlparse(base_url).hostname or ''
    if mode == 'paper':
        if host not in PAPER_HOSTS:
            raise LiveGuardError(f'모의투자 모드인데 호출 주소가 모의 서버가 아닙니다({host}). NHPLUG_BASE_URL을 moapi로 맞추세요.')
        if account_type != '03':
            raise LiveGuardError('모의투자 모드에서는 모의 계좌(유형 03)만 쓸 수 있습니다.')
        return
    if mode == 'live':
        if host not in LIVE_HOSTS:
            raise LiveGuardError(f'실전 모드인데 호출 주소가 실전 서버가 아닙니다({host}).')
        if account_type == '03':
            raise LiveGuardError('실전 모드에 모의 계좌가 지정됐습니다.')
        if env.get('TRADER_LIVE_ACCOUNT') != account:
            raise LiveGuardError('실전 주문은 환경 변수 TRADER_LIVE_ACCOUNT에 같은 계좌번호를 직접 넣어야 열립니다.')
        return
    raise LiveGuardError(f'알 수 없는 모드: {mode}')


def order_payload(account: str, code: str, shares: int, price: int | None = None) -> dict:
    """PLUG 현금 주문 본문(공식 SDK 예제와 같은 필드). price가 없으면 시장가(05), 있으면 지정가(01)."""
    if not (isinstance(code, str) and len(code) == 6 and code.isalnum()):
        raise ValueError('종목코드는 6자리여야 합니다.')
    if not (isinstance(shares, int) and shares > 0):
        raise ValueError('주문 수량이 올바르지 않습니다.')
    body = dict(act_no=account, iem_cd=code, orr_qty=shares, nmn_pr_tp_cd='05' if price is None else '01',
                orr_cnd_dit_cd='00', ssl_nmn_pr_dit_cd='00', rmt_mkt_cd='KRX', sor_mkt_sli_yn='N')
    if price is not None:
        if not (isinstance(price, int) and price > 0):
            raise ValueError('지정가는 원 단위 양의 정수여야 합니다.')
        body['orr_pr'] = price
    return body


QUOTE_BASE_URL = 'https://api.nhplug.com:8443'


def live_quote_call(path: str, body: dict, call=None, env=os.environ):
    """시세 조회만 실전 서버로 보낸다. 모의 서버는 시세 API를 주지 않는다(IGW40023, 2026-11-09 확인).
    토큰은 원래 실전 인증 서버에서만 나오므로 같은 토큰을 쓴다. 주문·잔고 경로는 여기로 올 수 없다."""
    if not path.startswith('/krstock/quote/'):
        raise LiveGuardError(f'실전 서버에는 시세 조회만 보낼 수 있습니다({path}).')
    if call is None:
        from nhplug import call
    old = env.get('NHPLUG_BASE_URL')
    env['NHPLUG_BASE_URL'] = QUOTE_BASE_URL
    try:
        return call(path, body)
    finally:
        if old is None:
            env.pop('NHPLUG_BASE_URL', None)
        else:
            env['NHPLUG_BASE_URL'] = old


class PlugBroker:
    """나무 PLUG 연결(모의투자 우선). call은 nhplug.call — 시험에서는 가짜를 넣는다."""
    BUY = '/krstock/order/v1/cashBuy'
    SELL = '/krstock/order/v1/cashSell'
    PRICE = '/krstock/quote/v1/currentPrice'
    BALANCE = '/krstock/inquiry/v1/balance'

    def __init__(self, *, mode: str, account: str, account_type: str, base_url: str, call=None, quote_call=None, env=os.environ):
        check_target(mode, base_url, account, account_type, env)
        call_given = call is not None
        if call is None:
            from nhplug import call as sdk_call  # PC에만 설치(pip install git+https://github.com/PLUG-OpenAPI/nhplug-sdk)
            call = sdk_call
        self.mode, self.account, self._call = mode, account, call
        self._quote_call = quote_call or (lambda path, body: live_quote_call(path, body, call=self._call if call_given else None, env=env))
        self.responses: list[dict] = []   # 원문 응답 기록(해석 확인용)

    def _send(self, path, body):
        res = self._call(path, body)
        self.responses.append(dict(path=path, body=body, response=res))
        return res

    # 응답 해석은 모의 서버 실제 응답으로 확인한 뒤 채운다. 확인 전에는 봇이 이 경로로 주문하지 않는다.
    def quote(self, code):
        body = dict(iem_cd=code, market_cd='KRX')
        res = self._quote_call(self.PRICE, body)   # 시세는 실전 서버(조회 전용), 주문·잔고는 모의 서버
        self.responses.append(dict(path=self.PRICE, body=body, response=res))
        o = (res or {}).get('Output_0') or {}
        num = lambda k: float(o[k]) if o.get(k) not in (None, '') else None
        return Quote(code, num('stck_prpr'), num('stck_oprc'), num('stck_sdpr'))  # 필드명: 현재가는 SDK 예제 확인, 시가·기준가는 확인 필요

    def cash(self):
        raise NotImplementedError('잔고 응답 필드는 모의투자 키 발급 후 확인합니다.')

    def holdings(self):
        raise NotImplementedError('잔고 응답 필드는 모의투자 키 발급 후 확인합니다.')

    def buy(self, code, shares, *, reference):
        return self._order(self.BUY, 'buy', code, shares, reference)

    def sell(self, code, shares, *, reference):
        return self._order(self.SELL, 'sell', code, shares, reference)

    def _order(self, path, side, code, shares, reference):
        res = self._send(path, order_payload(self.account, code, shares))
        # 접수 응답만으로 체결을 판단하지 않는다(같은 응답 코드가 API마다 뜻이 다름). 체결은 잔고·체결 조회로 맞춘다.
        return None if res is None else Fill(code, side, shares, reference, math.nan, order_id=str((res.get('Output_0') or {}).get('odno') or '') or None)
