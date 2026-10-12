# 홈페이지 수동 수집

조회 기간 누적 합계는 선택 구간의 일별 관측값을 합산한다. 결측이 있으면 확인된 값 합계로 표시하며 실제 0과 구분한다. 종목 필터와 무관한 데이터셋 전체 기준이다.

수동 수집은 홈페이지 → Vercel `/api/collect` → 비공개 `SupplyKRX-data`의 `collect.yml` 실행 순서다. 기존 예약 수집은 유지한다.

## 서버 인증 설정

1. GitHub fine-grained personal access token을 만든다. 소유자 YKshin92, 저장소는 SupplyKRX-data만 선택한다. Actions: Read and write와 필수 Metadata만 허용한다. 만료일을 지정한다.
2. Vercel supply-krx 프로젝트 Environment Variables에서 `GITHUB_COLLECTION_TOKEN`을 Production의 Secret으로 저장한다. 토큰은 사용자가 직접 입력하며 채팅·코드·파일에는 쓰지 않는다.
3. 환경 변수 저장 후 운영 재배포한다. 기존 Vercel Authentication이 API에도 적용돼야 한다. API를 외부 공개하거나 우회 경로로 제공하지 않는다.
4. 홈페이지의 데이터 수집 버튼으로 실행한다. 대기·수집 상태와 실행 내역을 확인한다. 수집 성공 후 배포된 manifest의 수집 시각이 바뀌면 화면 데이터를 다시 불러온다.

API는 POST 출처를 운영 도메인으로 제한한다. 실행 중이거나 최근 60초 안에 시작한 작업은 재사용한다. GitHub workflow concurrency와 수집 중복 검사도 유지한다. 수집·배포는 비동기이며 최대 12분까지 상태를 확인한다. GitHub/Vercel 지연이나 배포 실패는 수집 성공과 별개로 표시한다.

서버 인증 미설정·만료·권한 부족은 명시적으로 실패한다. 토큰이나 원자료를 응답하지 않는다. Vite 로컬 정적 서버는 이 API를 실행하지 않으므로 실제 수집은 운영 배포에서 검증한다.
