# 이메일 인증코드 로그인

이 변경은 로컬 준비 단계이다. Descope 프로젝트 연결과 실제 이메일 로그인 검증 전에는 운영 빌드의 UI 커밋을 변경하지 않는다.

## 서비스 설정

- Descope User Auth 무료 플랜을 supply-krx Vercel 프로젝트에 연결한다. Clerk 환경 변수는 사용하지 않는다.
- Descope Project ID를 Vercel Production 서버 환경 변수 `DESCOPE_PROJECT_ID`에 설정한다. Marketplace의 기본 NEXT_PUBLIC_DESCOPE_PROJECT_ID도 서버에서 지원한다. 다른 접두사로 생성하면 해당 공개 Project ID만 위 이름으로 등록한다. 관리 API 키는 필요하지 않는다.
- OTP 이메일 인증을 활성화하고 SDK/API 사용을 허용한다. 인증코드는 6자리, 만료 3~5분으로 설정한다. 정적 테스트 코드는 운영에서 비활성화한다.
- 신규 사용자의 이메일 인증 및 가입을 허용한다. 수신자별 재전송 및 잘못된 코드 시도 횟수 제한을 설정한다. 다른 인증 방식은 필요하지 않다.
- 허용 도메인을 `https://supply-krx.vercel.app`로 제한한다. 별도 커스텀 도메인은 사용하지 않는다.
- 인증 후 확인한 소유자의 Descope 사용자 ID를 서버 환경 변수 `COLLECTION_ADMIN_USER_IDS`에 넣는다. 여러 명이면 쉼표로 구분한다. 비어 있으면 수집은 아무도 실행할 수 없다. 이메일 주소나 요청 헤더로 관리자 권한을 추정하지 않는다.
- 기본 이메일 발송 한도는 공식 요금표상 무료 플랜 하루 1,000건이다. 실제 설정 및 발송 성공을 확인한다. 유료 플랜이나 발송 서비스는 별도 승인 없이 추가하지 않는다.

## 접근 보호

`proxy.js`는 Vercel CDN 캐시보다 먼저 `/data/**`와 `/api/**` 접근을 검증한다. 로그인 공개 API는 `/api/auth`뿐이며, 세션 등록과 로그아웃은 정확한 Origin과 POST를 요구한다. 로그인 성공 시 SDK가 받은 짧은 세션 JWT를 서버에서 서명·유효기간·프로젝트 audience 검증 후 `__Host-supply-session` HttpOnly/Secure/SameSite=Lax 쿠키에 저장한다. 갱신 JWT로 쿠키를 다시 등록하며 만료된 화면은 닫는다. 응답은 private/no-store이다.

일반 로그인 사용자는 데이터를 조회하지만 수집은 거부된다. `/api/collect`도 자체적으로 관리자 인증을 검증한다. CSV/TSV/ZIP 경로는 로그인 후에도 거부한다. 브라우저가 조회한 JSON 자체의 복사를 막는 기능은 아니다.

## 비공개 운영 저장소 배포 준비

운영은 SupplyKRX-data의 루트 API 및 빌드를 사용한다. 공개 소스만 수정하면 서버 보호가 함께 배포되지 않는다. 다음을 하나의 비공개 저장소 커밋으로 반영해야 한다.

1. `server/auth.js`, `api/auth.js`, `api/collect.js`, `proxy.js`를 동일하게 복사한다.
2. 루트 `package.json`은 `type: module`, 서버 dependencies `@descope/node-sdk`, `@vercel/functions`를 포함한다. lockfile을 함께 생성한다. 기존 `installCommand`를 `npm ci --omit=dev`로 바꿔 실제 루트 서버 의존성을 설치한다.
3. 비공개 `vercel.json`은 기존 framework:null, buildCommand, web-dist를 유지하면서 공개 소스의 proxy 설정 및 private/no-store 데이터·API 헤더를 적용한다.
4. `scripts/build-web.sh`의 APP_COMMIT을 검증된 공개 소스 커밋으로 변경한다. 기존 공개 소스 임시 디렉터리 npm ci/build와 비공개 원자료 변환은 유지한다.
5. 현재의 Vercel 접근 보호를 유지한 채 배포하여 미로그인 데이터 401, 변조 토큰 401, 일반 사용자 수집 403, 관리자 수집 성공, 이메일 신규 가입·재접속·세션 갱신·로그아웃을 실제 URL에서 검증한다.
6. 모든 검증 후에만 기존 Vercel 접근 보호 해제를 진행한다. 현재 사이트를 로그인 연결 전 공개로 전환하지 않는다.

## 로컬 검증

`npm test`에 인증 및 수집 권한 검증이 포함된다. `npm run build`로 타입과 빌드를 검증한다. 일반 Vite dev/preview는 Vercel 서버 API와 proxy를 실행하지 않으므로 인증 보호 검증에 사용하지 않는다. `node scripts/serve-auth-local.mjs`는 loopback 4181에서 실제 서버 인증 경로와 proxy를 실행하며 dist를 제공한다. 서비스 ID가 없으면 데이터와 화면은 연결 준비 상태로 닫힌다. 환경 변수는 현재 주소 유지 설정과 별도로 로컬에서 `AUTH_APP_ORIGIN=http://127.0.0.1:4181`로 맞춰야 한다. 실제 원자료는 공개 저장소에 넣지 않는다.
