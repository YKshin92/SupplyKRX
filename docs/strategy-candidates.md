# 전략 개선 후보 (2026-11-03)

일일 개선 연구가 찾은 매매법 개선안을 사용자가 승인하고, 승인한 것을 모아 운영에 반영하는 흐름이다. 사이트는 파일을 직접 고치지 않는다.

## 흐름
1. **후보 등록** — 일일 개선 연구(예약 작업)가 판정을 통과했거나 사용자 판단이 필요한 개선안을 비공개 `data/strategy/candidates.json`에 추가하고
   `data: strategy candidate ...` 커밋으로 배포한다(이 배포는 취소하지 않는다).
2. **승인 / 승인 취소** — 관리자가 '전략 개선 후보' 탭에서 누른다. 사이트 → `/api/strategy`(관리자만, 운영 도메인·요청 헤더 확인) →
   비공개 `strategy-decision.yml` 실행 → `collector/strategy_candidates.record`가 지금 상태에서 가능한 요청인지 확인한 뒤 `data/strategy/decisions.json`에 기록.
3. **반영 요청** — 승인된 항목 전체를 한 번에 요청한다(같은 경로, action `apply`). 상태는 '반영 대기'.
4. **새벽 일괄 적용** — 예약 작업 'SupplyKRX 전략 후보 반영'(매일 01:47 KST, 데이터 수집·연구 시간과 겹치지 않음)이 반영 대기 항목을 코드·자료·화면·과거 8년 검증까지
   함께 고치고 테스트·배포·화면 코드를 확인한 뒤 `data/strategy/applied.json`에 `applied`(앱 커밋·업데이트 내역 id) 또는 `failed`(이유)를 기록한다.
5. **반영됨** — 탭에 '반영됨'(날짜·앱 버전)으로 표시. 실패하면 '반영 실패'와 이유가 보이고 다시 승인할 수 있다.

## 파일과 쓰는 쪽
| 파일 | 쓰는 쪽 | 내용 |
|---|---|---|
| data/strategy/candidates.json | 연구 예약 작업 | 후보(id, 제목, 바꾸는 내용, 숫자, 주의할 점, 바뀌는 곳) |
| data/strategy/decisions.json | strategy-decision.yml만 | 관리자 승인·승인 취소·반영 요청 기록 |
| data/strategy/applied.json | 새벽 반영 예약 작업만 | 반영 결과(applied/failed) |
상태는 세 파일을 시간순으로 합쳐 계산한다(`collector/strategy_candidates.derive`). 반영 요청 없이 적힌 결과는 무시한다.
웹 자료는 빌드 때 `scripts/publish-strategy-candidates.py`가 `data/live/strategy-candidates.json`(로그인 필요)으로 만든다.

## 권한
- 승인·반영 요청은 `COLLECTION_ADMIN_USER_IDS`의 관리자만(프록시와 API 두 곳에서 확인). 일반 회원은 목록만 본다.
- GitHub 호출은 수동 수집과 같은 `GITHUB_COLLECTION_TOKEN`(SupplyKRX-data Actions 읽기·쓰기만)을 쓴다. 새 토큰·권한 없음.
- 기록 커밋은 워크플로의 기본 GITHUB_TOKEN(contents: write, 이 저장소만)으로 한다.
