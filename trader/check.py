"""PC 연결 시험(주문 없음): 키 파일 → 접속 토큰 → 계좌 목록(모의 계좌 03 찾기) → 현재가 → 모의 계좌 잔고 → 사이트 우편함.

키·토큰·계좌번호 전체는 화면에 찍지 않는다(계좌는 끝 4자리만). 응답의 '필드 이름'만 state/logs/check-fields.json 에 남겨,
PlugBroker 의 잔고·체결 해석을 실제 응답에 맞추는 데 쓴다(값은 남기지 않음).
usage: python -m trader.check [--state DIR] [--code 005930]
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from .bot import DEFAULT_STATE


def shape(x, depth=0):
    """값 없이 구조만: dict → {키: 구조}, list → [첫 항목 구조], 나머지 → 타입 이름."""
    if depth > 4:
        return '...'
    if isinstance(x, dict):
        return {k: shape(v, depth + 1) for k, v in x.items()}
    if isinstance(x, list):
        return [shape(x[0], depth + 1)] if x else []
    return type(x).__name__


def mask(acct: str) -> str:
    acct = str(acct or '')
    return ('*' * max(0, len(acct) - 4)) + acct[-4:]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--state', default=str(DEFAULT_STATE))
    ap.add_argument('--code', default='005930')
    a = ap.parse_args()
    out, fields, ok = [], {}, True

    def say(mark, text):
        out.append(f'{mark} {text}')
        print(f'{mark} {text}')

    try:
        import nhplug
        from nhplug import call, get_base_url, get_token
    except Exception as e:
        say('✗', f'나무 PLUG SDK를 불러오지 못했습니다: {e} → install.ps1 을 다시 실행하세요.')
        return 1
    files = [str(p) for p in nhplug.loaded_files()] if hasattr(nhplug, 'loaded_files') else []
    say('✓' if files else '✗', f'키 파일: {", ".join(files) or "못 찾음 (%USERPROFILE%\\.nhplug\\.env)"}')
    base = get_base_url()
    mock = '//moapi.' in base
    say('✓' if mock else '!', f'호출 서버: {base} ({"모의투자" if mock else "실전 — 지금 단계에서는 moapi 여야 합니다"})')
    try:
        get_token()
        say('✓', '접속 토큰 발급됨(24시간 유효, 값은 표시하지 않음)')
    except Exception as e:
        say('✗', f'접속 토큰 발급 실패: {e}')
        ok = False
    mock_acct = None
    if ok:
        try:
            res = call('/n2/acctinfo', {})
            fields['acctinfo'] = shape(res)
            rows = (res or {}).get('Output_0') or []
            for r in rows:
                say('·', f"계좌 {mask(r.get('acct_no'))} 유형 {r.get('acct_type')}{' (모의투자)' if r.get('acct_type') == '03' else ''}")
            mock_acct = next((r.get('acct_no') for r in rows if r.get('acct_type') == '03'), None)
            say('✓' if mock_acct else '!', '모의투자 계좌(유형 03) ' + ('있음' if mock_acct else '없음 → 나무 앱에서 모의투자 신청이 필요할 수 있습니다'))
        except Exception as e:
            say('✗', f'계좌 목록 조회 실패: {e}')
        try:
            from .broker import live_quote_call  # 모의 서버는 시세를 주지 않아 시세만 실전 서버(조회 전용)
            res = live_quote_call('/krstock/quote/v1/currentPrice', {'iem_cd': a.code, 'market_cd': 'KRX'})
            fields['currentPrice'] = shape(res)
            o = (res or {}).get('Output_0') or {}
            say('✓' if o.get('stck_prpr') else '!', f"현재가 {a.code}: {o.get('stck_prpr')} (응답 {res.get('rsp_cd')} {res.get('rsp_msg')})")
        except Exception as e:
            say('✗', f'현재가 조회 실패: {e} (실전 서버 시세 조회 · 회사 방화벽이 8443 포트를 막는지도 확인)')
        if mock_acct and mock:
            try:
                res = call('/krstock/inquiry/v1/balance', {'act_no': mock_acct, 'bnc_bse_cd': '5', 'ltg_aot_dit_cd': '9', 'aet_bse': '2', 'qut_dit_cd': 'UNT', 'aly_qut_cd': '1'})
                fields['balance'] = shape(res)
                o = (res or {}).get('Output_0') or {}
                say('✓', f"모의 계좌 잔고: 예수금 {o.get('dca')} · 총자산 {o.get('tot_aet_amt')} · 보유 {len((res or {}).get('Output_1') or [])}종목")
                say('·', f"config.json 의 account 에 넣을 모의 계좌: 끝자리 {mask(mock_acct)[-4:]} (계좌번호 전체는 나무 앱에서 확인)")
            except Exception as e:
                say('✗', f'잔고 조회 실패: {e}')
    if os.environ.get('SUPPLYKRX_TRADER_TOKEN'):
        try:
            from .sync import Mailbox
            m = Mailbox()
            feed, _ = m.get_json('trading/feed.json')
            say('✓' if feed else '!', f"사이트 우편함: 신호 공급 {'기준일 ' + feed['as_of'] if feed else '아직 없음(다음 수집 뒤 생김)'} · 긴급 정지 {'켜짐' if m.remote_stopped() else '꺼짐'}")
        except Exception as e:
            say('✗', f'사이트 우편함 연결 실패: {e}')
    else:
        say('!', '사이트 연결 토큰(SUPPLYKRX_TRADER_TOKEN)이 아직 없습니다 — 자동매매 탭 연결은 나중에.')
    logs = Path(a.state) / 'logs'
    logs.mkdir(parents=True, exist_ok=True)
    (logs / 'check-fields.json').write_text(json.dumps(fields, ensure_ascii=False, indent=1), encoding='utf-8')
    (logs / 'check-result.txt').write_text('\n'.join(out) + '\n', encoding='utf-8')
    print(f"\n결과: {logs / 'check-result.txt'} · 응답 필드 구조(값 없음): {logs / 'check-fields.json'}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
