"""PC 봇 ↔ 사이트 연결: 비공개 저장소 SupplyKRX-data의 trading-state 가지를 우편함으로 쓴다(이 가지는 배포하지 않는다).

- 봇이 올림: trading/state.json (현재 잔고 · 거래내역 · 매매 성과)
- 사이트가 올림(긴급 정지 버튼 → trading-control.yml): trading/control.json {"stopped": true|false, ...}
PC 토큰은 환경 변수 SUPPLYKRX_TRADER_TOKEN(SupplyKRX-data 한 저장소 · Contents 읽기/쓰기만)에서 읽는다. 저장소·장부에 두지 않는다.
"""
from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request

REPO = 'YKshin92/SupplyKRX-data'
BRANCH = 'trading-state'
STATE = 'trading/state.json'
CONTROL = 'trading/control.json'


class Mailbox:
    def __init__(self, token: str | None = None, *, repo: str = REPO, branch: str = BRANCH, opener=None):
        self.token = token or os.environ.get('SUPPLYKRX_TRADER_TOKEN')
        if not self.token:
            raise RuntimeError('SUPPLYKRX_TRADER_TOKEN이 없습니다(PC 환경 변수).')
        self.repo, self.branch = repo, branch
        self.open = opener or urllib.request.urlopen

    def _request(self, method: str, path: str, body: dict | None = None):
        req = urllib.request.Request(f'https://api.github.com/repos/{self.repo}/contents/{path}' + (f'?ref={self.branch}' if method == 'GET' else ''),
                                     method=method, data=json.dumps(body).encode() if body else None,
                                     headers={'Authorization': f'Bearer {self.token}', 'Accept': 'application/vnd.github+json',
                                              'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json'})
        try:
            with self.open(req, timeout=20) as res:
                return json.loads(res.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            raise

    def get_json(self, path: str):
        meta = self._request('GET', path)
        if meta is None:
            return None, None
        return json.loads(base64.b64decode(meta['content']).decode()), meta['sha']

    def put_json(self, path: str, obj, message: str) -> None:
        _, sha = self.get_json(path)
        body = dict(message=message, branch=self.branch, content=base64.b64encode(json.dumps(obj, ensure_ascii=False).encode()).decode())
        if sha:
            body['sha'] = sha
        self._request('PUT', path, body)

    def remote_stopped(self) -> bool:
        """사이트 긴급 정지 상태. 잠깐 읽지 못하면 마지막으로 읽은 값을 쓰고, 한 번도 읽지 못했으면 '정지'로 본다."""
        try:
            control, _ = self.get_json(CONTROL)
        except Exception:
            return getattr(self, '_last_stopped', True)
        self._last_stopped = bool(control and control.get('stopped'))
        return self._last_stopped
