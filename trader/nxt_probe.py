"""NXT 수급 크기 재기(조회 전용, 주문 없음) — 나무 PLUG '주식현재가 투자자'(HTS 1311)를 KRX·NXT·통합으로 받아
기관계·외국인·개인 순매수가 NXT 에서 얼마나 되는지 비교한다. 연기금 구분은 이 API 에 없다.

  & $py -X utf8 -m trader.nxt_probe            # 신호·순매도 종목 + 대형주, 최근 20거래일
결과: %USERPROFILE%\\.supplykrx-trader\\logs\\nxt-probe.json (값은 종목·날짜별 순매수 수량과 종가)
"""
from __future__ import annotations

import argparse
import json
import time
from datetime import datetime
from pathlib import Path

from .bot import DEFAULT_STATE
from .broker import live_quote_call

PATH = '/krstock/quote/v1/currentInvestor'
MARKETS = ('KRX', 'NXT', 'UNT')
BIG = ['005930', '000660', '005380', '373220', '207940', '035420', '051910', '068270', '105560', '012330']
KEYS = ('gigwan', 'invest', 'person', 'frgn_ntby_qty')


def num(row: dict, key: str):
    for k in (key, key + 'z10'):
        v = row.get(k)
        if v not in (None, ''):
            try:
                return float(v)
            except (TypeError, ValueError):
                return None
    return None


def fetch(code: str, market: str, days: int, call=live_quote_call):
    res = call(PATH, {'Input_0': {'market_cd': market, 'iem_cd': code, 'array_cnt': str(days)}})
    if (res or {}).get('rsp_cd') not in (None, '00000'):
        return dict(error=f"{res.get('rsp_cd')} {res.get('rsp_msg')}")
    rows = (res or {}).get('Output_0') or []
    return dict(rows=[dict(date=r.get('bsop_date1'), close=num(r, 'stck_prpr'), volume=num(r, 'acml_vol'),
                           **{k: num(r, k) for k in KEYS}) for r in rows])


def codes_from_feed(state: Path) -> list[str]:
    try:
        from .sync import Mailbox
        feed, _ = Mailbox().get_json('trading/feed.json')
        sig = [s['code'] for s in feed.get('signals', [])]
        sells = [s['code'] for s in feed.get('sells', [])]
        return list(dict.fromkeys(sig + sells))
    except Exception as e:
        print('! 신호 공급 파일을 못 읽어 대형주만 봅니다:', type(e).__name__)
        return []


def main():
    ap = argparse.ArgumentParser(description='NXT 수급 크기 재기(조회 전용)')
    ap.add_argument('--days', type=int, default=20)
    ap.add_argument('--limit', type=int, default=60, help='신호·순매도 종목 최대 수')
    ap.add_argument('--state', default=str(DEFAULT_STATE))
    a = ap.parse_args()
    state = Path(a.state)
    codes = list(dict.fromkeys(codes_from_feed(state)[:a.limit] + BIG))
    print(f'{len(codes)}종목 × KRX·NXT·통합, 최근 {a.days}거래일 조회(초당 4건, 약 {len(codes) * 3 // 4 + 1}초)')
    out = dict(generated_at=datetime.now().isoformat(timespec='seconds'), days=a.days, path=PATH, stocks={})
    for i, code in enumerate(codes, 1):
        out['stocks'][code] = {}
        for m in MARKETS:
            try:
                out['stocks'][code][m] = fetch(code, m, a.days)
            except Exception as e:
                out['stocks'][code][m] = dict(error=type(e).__name__ + ': ' + str(e)[:200])
            time.sleep(0.26)
        if i % 10 == 0:
            print(f'  {i}/{len(codes)}')
    p = state / 'logs' / 'nxt-probe.json'
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(out, ensure_ascii=False), encoding='utf-8')
    ok = sum(1 for s in out['stocks'].values() for v in s.values() if 'rows' in v)
    print(f'완료: 응답 {ok}/{len(codes) * 3} · {p}')


if __name__ == '__main__':
    main()
