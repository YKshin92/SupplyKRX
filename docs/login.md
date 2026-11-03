# 로그인 (관리자 발급 계정)

2026-11-03부터 사이트는 관리자가 발급한 아이디·비밀번호로만 들어온다. 전에는 이메일 인증코드만 받으면 누구나 자동 가입됐다.
가입 화면은 없다. 계정이 필요한 사람은 관리자에게 문의하고, 관리자가 Descope 콘솔에서 계정을 만들어 준다.

## 누가 들어오는가 (서버에서 확인)

- 서버(`server/auth.js` `validateToken`)는 Descope가 서명한 세션 JWT를 검증한 뒤 다음 둘 중 하나만 통과시킨다.
  - 관리자: 사용자 ID가 Vercel 서버 환경 변수 `COLLECTION_ADMIN_USER_IDS` 또는 `ADMIN_USER_IDS`(2026-11-04, master 계정)에 있는 사람 (모든 탭, 수집·승인 가능).
  - 회원: 관리자가 콘솔에서 역할 `viewer`(서버 환경 변수 `MEMBER_ROLE`로 바꿀 수 있음, 비우면 회원 없음)를 준 사람. 시장 현황·종목 발굴·신규 순매수 추적·전략 검증만 본다(guest).
- 계정: Descope 콘솔은 로그인 ID로 이메일·전화만 받아 `master@supply-krx.vercel.app`, `guest@supply-krx.vercel.app`(메일함 없는 주소, 초대 끔)로 만들고, 로그인 화면에서는 `master`·`guest`만 입력한다. 콘솔은 임시 비밀번호만 발급하므로 로그인 화면의 ‘비밀번호 바꾸기’(password.replace)로 각자 바꾼다.
- 2026-11-04부터 접근은 **master와 guest 두 계정뿐**이다: 관리자 = master(`COLLECTION_ADMIN_USER_IDS`, `ADMIN_USER_IDS`), 회원 = guest(`MEMBER_USER_IDS`). `MEMBER_USER_IDS`가 있으면 그 ID만 회원이고 역할은 보지 않는다. 임시 계정을 새로 줄 때는 콘솔에서 계정을 만든 뒤 그 사용자 ID를 `MEMBER_USER_IDS`에 쉼표로 더하고 재배포한다(빼면 다음 세션 갱신 때 막힌다). 관리자 이메일 인증 임시 로그인은 master 확인 후 없앴다.
- 그 밖의 계정은 로그인에 성공해도 403(‘관리자가 발급한 계정만 접속할 수 있습니다’)으로 막고 세션 쿠키를 지운다.
  Descope 공개 API로 누가 직접 가입해도 역할이 없으므로 들어올 수 없다. 예전에 이메일로 가입한 계정도 같은 이유로 막힌다.
- 역할은 JWT 최상위 `roles`만 본다(테넌트 역할·권한·요청 값은 보지 않음). 대소문자를 구분한다.

## Descope 콘솔 설정 (관리자가 직접)

비밀번호는 코드·저장소·환경 변수 어디에도 넣지 않는다. 관리자가 콘솔에서 직접 입력한다.
1. Authentication Methods → Passwords를 켠다. 최소 길이·잠금(여러 번 틀리면 잠금) 정책을 정한다.
2. Authorization → Roles에서 역할 `viewer`를 만든다.
3. Users에서 계정을 만든다(Login ID = 아이디). 관리자 아이디는 역할 없이, 게스트·임시 계정은 `viewer` 역할로 만들고 비밀번호를 정한다.
4. 새로 만든 관리자 계정의 사용자 ID(U로 시작)를 `COLLECTION_ADMIN_USER_IDS`에 넣는다(기존 ID 대신 또는 함께, 쉼표 구분). 재배포해야 적용된다.
5. 임시 계정을 끝낼 때는 콘솔에서 해당 사용자를 비활성화하거나 `viewer` 역할을 뺀다. 이미 열린 화면도 세션 갱신(수 분) 때 막힌다.
6. 이메일 인증코드(OTP) 방식은 더 쓰지 않으므로 꺼도 된다.

## 처음 전환 순서
콘솔 1~4를 마친 뒤에 화면·서버를 배포한다. 먼저 배포하면 관리자도 아이디로 들어올 수 없다.
배포 후 운영 주소에서 관리자 로그인·수집 버튼, 게스트 로그인(조회만, 수집·승인 403), 역할 없는 계정 403, 로그아웃을 확인한다.

## 접근 보호

`proxy.js`는 Vercel CDN 캐시보다 먼저 `/data/**`와 `/api/**` 접근을 검증한다. 로그인 공개 API는 `/api/auth`뿐이며, 세션 등록과 로그아웃은 정확한 Origin과 POST를 요구한다. 로그인 성공 시 SDK가 받은 짧은 세션 JWT를 서버에서 서명·유효기간·프로젝트 audience 검증 후 `__Host-supply-session` HttpOnly/Secure/SameSite=Lax 쿠키에 저장한다. 갱신 JWT로 쿠키를 다시 등록하며 만료된 화면은 닫는다. 응답은 private/no-store이다.

회원(`viewer`)은 데이터를 조회하지만 수집·전략 승인은 거부된다. `/api/collect`도 자체적으로 관리자 인증을 검증한다. CSV/TSV/ZIP 경로는 로그인 후에도 거부한다. 브라우저가 조회한 JSON 자체의 복사를 막는 기능은 아니다.

## 비공개 운영 저장소 배포 준비

운영은 SupplyKRX-data의 루트 API 및 빌드를 사용한다. 공개 소스만 수정하면 서버 보호가 함께 배포되지 않는다. 다음을 하나의 비공개 저장소 커밋으로 반영해야 한다.

1. `server/auth.js`, `api/auth.js`, `api/collect.js`, `proxy.js`를 동일하게 복사한다.
2. 루트 `package.json`은 `type: module`, 서버 dependencies `@descope/node-sdk`, `@vercel/functions`를 포함한다. lockfile을 함께 생성한다. 기존 `installCommand`를 `npm ci --omit=dev`로 바꿔 실제 루트 서버 의존성을 설치한다.
3. 비공개 `vercel.json`은 기존 framework:null, buildCommand, web-dist를 유지하면서 공개 소스의 proxy 설정 및 private/no-store 데이터·API 헤더를 적용한다.
4. `scripts/build-web.sh`의 APP_COMMIT을 검증된 공개 소스 커밋으로 변경한다. 기존 공개 소스 임시 디렉터리 npm ci/build와 비공개 원자료 변환은 유지한다.
5. 최초 전환 또는 인증 변경 시 미로그인 데이터 401, 변조 토큰 401, 역할 없는 계정 403, 회원 수집 403, 관리자 수집 성공, 재접속·세션 갱신·로그아웃을 실제 URL에서 검증한다.
6. 모든 검증 후에만 Vercel Standard Protection으로 전환한다. 운영 주소는 앱 로그인으로 보호하고 미리보기·배포별 생성 주소의 Vercel 보호는 유지한다. 로그인 연결 전 공개로 전환하지 않는다.

## 로컬 검증

`npm test`에 인증 및 수집 권한 검증이 포함된다. `npm run build`로 타입과 빌드를 검증한다. 일반 Vite dev/preview는 Vercel 서버 API와 proxy를 실행하지 않으므로 인증 보호 검증에 사용하지 않는다. `node scripts/serve-auth-local.mjs`는 loopback 4181에서 실제 서버 인증 경로와 proxy를 실행하며 dist를 제공한다. 서비스 ID가 없으면 데이터와 화면은 연결 준비 상태로 닫힌다. 환경 변수는 현재 주소 유지 설정과 별도로 로컬에서 `AUTH_APP_ORIGIN=http://127.0.0.1:4181`로 맞춰야 한다. 실제 원자료는 공개 저장소에 넣지 않는다.