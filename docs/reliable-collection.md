# 자동 수집과 운영 반영 확인

현재 수집과 데이터 저장은 비공개 `YKshin92/SupplyKRX-data`에서 실행한다.
기존 GitHub 예약은 백업으로 유지한다. 외부 예약을 활성화하기 전 아래 인증 설정이 필요하다.
아직 외부 작업이나 토큰이 설정되지 않았다면 외부 예약이 작동한다고 간주하지 않는다.

## GitHub Secrets (SupplyKRX-data에만 설정)

- `KRX_ID`, `KRX_PW`: 기존 설정 유지.
- `VERCEL_TOKEN`: 해당 Vercel 팀에 배포 조회·재배포가 가능한 토큰. 짧은 만료 기간을 지정하고 갱신한다.
- `VERCEL_PROTECTION_BYPASS`: supply-krx의 Deployment Protection → Protection Bypass for Automation에서 발급한 전용 값.

토큰은 채팅이나 파일에 붙이지 않는다. GitHub 설정에 직접 입력한다.
운영 로그인 보호는 유지한다. 자동 검사에만 전용 헤더를 사용하며 원자료는 로그에 쓰지 않는다.
새 토큰 발급과 권한 부여는 사용자가 승인한 뒤 진행한다.

## cron-job.org 설정 (예약 시간: Asia/Seoul)

계정 생성·약관 동의는 사용자가 직접 수행한다.
GitHub fine-grained PAT는 `SupplyKRX-data` 한 저장소만 선택하고 Actions: Read and write를 부여한다.
해당 토큰은 cron-job.org의 Authorization 헤더에만 보관한다. KRX/Vercel 토큰은 외부 예약 서비스에 넣지 않는다.

요청 URL: `https://api.github.com/repos/YKshin92/SupplyKRX-data/actions/workflows/collect.yml/dispatches`
요청 방법: POST
헤더:
- `Authorization: Bearer <사용자가 직접 입력한 GitHub 토큰>`
- `Accept: application/vnd.github+json`
- `Content-Type: application/json`
- `X-GitHub-Api-Version: 2026-03-10`

작업 1: 평일 16:10·17:10·18:10·20:10.
본문: `{"ref":"main","inputs":{"require_verification":true,"check_only":false}}`

작업 2: 평일 16:30·17:30·18:30·20:30.
본문: `{"ref":"main","inputs":{"require_verification":true,"check_only":true}}`
최근 30분 안에 정상 수집된 자료가 있으면 재수집을 생략하고 운영 반영만 검사한다.
호출 실패·예약 비활성화 알림을 설정한다. 응답 본문 저장은 끈다.

수집·배포 오류 알림은 GitHub 계정 Notifications → Actions에서 실패 알림을 켠다.
외부 서비스의 HTTP 성공은 실행 요청 접수이며 수집 완료를 의미하지 않는다.
두 예약 작업 모두 시작되지 않는 장애까지 막아주는 구성은 아니다.

## 검증 및 제한

- 수집 오류는 최대 3번 시도한다. 수집 중복은 동일 concurrency 그룹과 최근 수집 검사로 제한한다.
- 시장별 빈 응답은 운영 데이터에 저장하지 않는다. 휴장일에는 직전 확보 거래일을 사용한다.
- 배포 상태와 커밋을 확인하고 실패한 같은 커밋을 최대 2번 재배포한다.
- 운영 도메인이 해당 커밋을 가리키고 `manifest.json`의 운영 모드·기준일이 일치해야 성공이다.
- 토큰 미설정 상태에서는 기존 예약 수집을 유지하되 검증 미활성 경고를 남긴다.
- 외부 호출은 `require_verification=true`이므로 검증 인증이 없거나 운영 반영이 실패하면 실패 처리한다.
- Vercel 조회가 401/403이면 권한을 고친다. 로그인 보호를 해제해 해결하지 않는다.
- 예약 서비스의 정시 실행이나 GitHub 실행 시작을 절대적으로 보장하지 않는다.
