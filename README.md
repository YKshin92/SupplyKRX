# SupplyKRX · 연기금 수급 연구소

연기금 등 수급으로 종목을 찾고 최근 20거래일 수급과 종가를 비교하는 개인 분석 대시보드입니다. 주문·계좌·자동매매 기능은 없습니다.

## 구성

- Python / pykrx 1.2.9: KRX 인증, 보통주 분류, 거래일 확인, 시장별 수급·종가 수집
- 날짜별 CSV: 원 단위 저장, 문자열 종목코드, 거래일·종목·투자자·거래 범위 키로 정정 반영
- React / TypeScript / Recharts: 검색·시장·수급·금액·연속일 필터, 순위, 관심 종목, 상세 차트, CSV 내보내기
- GitHub Actions: 테스트, 예약 및 수동 수집, 검증 후 저장, 선택적 Vercel 배포
- Vercel: 정적 홈페이지. 실시간 시세 API나 DB는 이번 버전에 포함하지 않음

## 빠른 실행

Node.js 22.18 이상과 Python 3.12를 권장합니다.

```sh
npm ci
npm run dev
```

개발 화면은 `http://127.0.0.1:5173`에서 열립니다. 처음에는 운영 데이터 연결 대기 화면입니다. **데모 둘러보기**를 선택하면 합성 12종목 × 20일 데이터가 표시됩니다. 데모를 실제 수급으로 대체 표시하지 않습니다.

```sh
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
python -m pip install -r requirements.txt
```

KRX 계정은 환경변수 `KRX_ID`, `KRX_PW`에 설정하세요. 실제 값을 소스나 커밋에 쓰지 마세요. `.env.example`은 항목 안내이며 자동 로드하지 않습니다.

```sh
# 최초 실제 5종목 검증
python -m collector.cli collect --end 2026-10-02 --codes 005930,000660,035420,005380,000270
# 전 종목의 최근 20거래일
python -m collector.cli collect --end 2026-10-02
# 제한된 기간 정정/복구
python -m collector.cli collect --start 2026-09-28 --end 2026-10-02
```

수집은 `data/live/daily/YYYY-MM-DD.csv`에 저장됩니다. 기존 날짜를 다시 실행하면 중복 대신 정정합니다. 기본적으로 최근 3거래일을 다시 확인하고 이후 날짜를 추가합니다. 한 번의 수집은 최대 20거래일이므로 장기간 중단 후에는 구간을 나누어 복구하세요. 휴장일에는 마지막 관측 거래일까지 확인하며 실패한 빈 응답을 휴장일로 판단하지 않습니다.

## 로컬에서 실제 자료 보기

`data/live`와 `public/data/live`는 Git에서 제외되어 있습니다. 로컬 조회용 JSON 생성:

```sh
python scripts/prepare-local.py
npm run build
npm run preview
```

`http://127.0.0.1:4173`에서 운영 데이터를 확인합니다. 이 빌드에는 실제 데이터가 포함되므로 공개 배포하지 마세요. `scripts/prepare-local.py`는 공개 배포 승인을 설정하지 않습니다.

제한된 Windows 환경에서 esbuild 자식 프로세스 실행이 차단되면 `npm run build:portable`을 사용할 수 있습니다. 이는 TypeScript와 Rollup으로 같은 앱을 빌드하는 로컬 대안이며 일반 배포에서는 `npm run build`를 사용합니다.

## CSV 가져오기

홈페이지의 **CSV 가져오기**는 브라우저 안에서만 처리하며 서버에 파일을 전송하지 않습니다. 새로고침하면 가져온 데이터는 사라집니다. 관심 종목만 브라우저에 저장됩니다.

표준 CSV 헤더:

```csv
date,code,name,market,investor,scope,buy,sell,net,buy_volume,sell_volume,net_volume,close,change_pct,volume,turnover,source,collected_at,finality
```

- 금액: 원, 수량: 주, 등락률: 퍼센트. 결측값은 빈칸이며 0과 다릅니다.
- `investor`: `연기금 등`. `market`: `KOSPI` 또는 `KOSDAQ`.
- `collected_at`: 시간대 포함 ISO 시각. `finality`: `unknown`, `provisional`, `final`, `demo`.
- `calendar.json`: `{ "sessions": ["2026-09-01", "2026-09-02"], "checked_through": "2026-09-02", "source": "검증한 거래일 출처" }`
- 거래일 달력이 없으면 일별 값은 표시하되 5·20일 합계, 연속 순매수는 계산하지 않습니다.
- CLI 적재: `python -m collector.cli import --csv file.csv --calendar calendar.json`

## GitHub Actions 운영

실제 수집은 별도 비공개 저장소 [YKshin92/SupplyKRX-data](https://github.com/YKshin92/SupplyKRX-data)의 **Daily pension and foreign data** 작업에서 실행합니다. 이 공개 코드 저장소에는 실제 원자료를 저장하지 않습니다.

- 비공개 저장소 Actions Secrets: `KRX_ID`, `KRX_PW`.
- 활성화 변수: `COLLECTION_ENABLED=true`. 중지하려면 `false`로 변경합니다.
- 일정: 한국 시간 평일 18:17 / 20:17. GitHub 예약 실행은 지연될 수 있습니다.
- 저장: 비공개 저장소 `data/live/daily/YYYY-MM-DD.csv` 및 `data/live/calendar.json`.
- 수동 복구: Actions → Daily pension and foreign data → Run workflow → 필요한 `start`, `end` 날짜 입력.
- 최근 3거래일을 다시 확인하고 새 거래일을 추가합니다. 검증 실패 시 기존 데이터 커밋을 유지합니다.
- 공개 저장소의 이전 수집 워크플로는 비활성화 상태로 유지합니다. Vercel 배포는 현재 사용하지 않습니다.

## Vercel 배포

1. 본인의 Vercel 계정에서 **Add New → Project**.
2. `YKshin92/SupplyKRX` 저장소 연결.
3. Framework: **Vite**, Build Command: **npm run build**, Output Directory: **dist**.
4. 최초 배포는 코드와 합성 데모만 포함합니다. KRX 비밀번호는 Vercel이나 `VITE_*` 변수에 넣지 않습니다.
5. 운영 데이터 공개가 허용된 경우에만 `public/data/live` 배포를 활성화합니다. 개인 전용 자료는 접근 제어가 검증된 별도 구성을 사용하세요.

Vercel 계정 연결 및 실제 배포가 끝나기 전에는 배포 URL이 없습니다.

## 검증

```sh
python -m unittest discover -s tests -v
npm test
npm run build
```

핵심 검증: 숫자와 단위, 순매수 항등식, 0과 결측, 실제 거래일 창, 부족한 기간, 연속일 경계, 중복 입력, 정정 적재, CSV 종목코드 보존, 데모/운영 혼합 차단. 검사 과정의 작은 파일은 무시되는 `work/test-runs`에 생성됩니다.

## 데이터 해석과 한계

- 연기금 등 합산 통계이며 국민연금 단독 수급이 아닙니다. 누적 순매수는 구간 합계이며 보유 잔고가 아닙니다.
- 표시 가격은 KRX 일별 종가입니다. 장중 현재가로 표시하지 않습니다.
- 정상 조회된 시장별 수급 응답에 종목이 없으면 매수·매도·순매수 금액과 수량을 0으로 저장합니다. `flow_status=absent_zero`로 구분하며 상세 화면에 처리 일수를 표시합니다. 기존 수집기의 같은 유형 결측도 다음 성공 수집 시 변환합니다. 조회 실패나 임의 CSV의 미확인 결측은 0으로 바꾸지 않습니다.
- 최근일 응답 누락과 과거 결측은 표시되며 불완전한 기간은 합계를 만들지 않습니다. 매일 순매수인 종목의 연속일은 관측 창의 하한값입니다.
- 종목 분류는 수집 당시 KRX 기본정보를 사용합니다. 신규 상장은 상장일 이전을 제외하지만 기간 중 상장폐지 종목의 완전 복원이나 과거 종목 구성 백테스트는 지원하지 않습니다.
- pykrx 웹 통계의 인증·스키마는 바뀔 수 있습니다. KRX/NXT 범위가 달라지면 어댑터와 출처 표시를 다시 검증해야 합니다. 임의 합산하지 않습니다.
- 현재 KRX 데이터의 재배포 권한을 확보했다는 의미가 아닙니다. 개인정보나 계정 정보는 데이터 파일에 포함하지 않습니다.

## 출처

- [pykrx 사용법·인증·주의사항](https://github.com/sharebook-kr/pykrx)
- [KRX 정보 수신·이용 안내](https://openapi.krx.co.kr/contents/OPP/DATA/OPPDATA003.jsp)
- [GitHub 예약 실행](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [Vercel Vite 배포](https://vercel.com/docs/frameworks/frontend/vite)

## 연기금 중심 + 외국인 보조 지표

수집 기본값은 KOSPI·KOSDAQ 보통주 전체의 **연기금 등 / 외국인** 두 분류입니다. 우선주·ETF·ETN·KONEX는 현재 대상이 아닙니다. 외국인은 기타외국인을 제외합니다. 가격은 같은 시장·날짜에 한 번 조회해 두 투자자에 공유합니다.

- 날짜별 CSV에 투자자 구분을 포함하므로 같은 종목·날짜의 두 수급이 서로 덮어써지지 않습니다.
- 홈페이지 종목 선별·순위·관심 목록은 연기금 기준입니다. 외국인은 상세 화면의 최근일·5일·20일 순매수 및 녹색 점선으로만 비교합니다.
- 가격 차트는 시가·고가·저가·종가 일봉입니다. CSV의 선택 필드 `open,high,low`가 없으면 봉을 추정하지 않습니다. 마우스를 올리면 OHLC 및 거래량이 보입니다.
- 외국인 웹 자료는 `public/data/live/foreign`에 별도로 생성됩니다. 기존 연기금 자료만 있는 저장소의 첫 수집은 외국인 20일분도 채웁니다.
- 예약 실행 시 종목 제한 없이 두 분류를 함께 수집합니다. 최근 3거래일 정정 확인은 계속 유지합니다. 수동 실행의 `codes`는 표본 검사 전용입니다.
- GitHub 예약 수집 일정은 한국 시간 평일 18:17, 20:17입니다. 실제 예약 실행은 위 비공개 데이터 저장소에서 활성화합니다. 공개 저장소의 원자료 게시 제한은 그대로 유지합니다.

로컬에서 새 자료를 반영하려면 `python scripts/prepare-local.py` 후 빌드합니다. 공개 저장소에는 실제 자료를 포함하지 않습니다.

### 20일 순매도 없는 종목 필터

최근 20거래일 연기금 순매수액이 하루 이상 양수이고 모든 날 0 이상인 종목입니다. 매도금액 자체가 0이라는 뜻은 아닙니다. 수급 결측 또는 신규 상장 등으로 20일이 부족하면 제외합니다. 외국인 수급은 이 필터에 영향을 주지 않습니다.

### 시가총액·업종

종목 상세에서 최신 수급일 기준 시가총액과 KRX 업종 분류를 표시합니다. 산업 테마나 자체 추정 섹터가 아닙니다. 시가총액은 원본을 원 단위로 보관하고 화면에서 조원/억원으로 표시합니다. `calendar.json`의 `instruments`에 기준일·출처와 함께 저장합니다. 수집 과정에서 두 시장의 업종분류현황을 함께 갱신합니다. 거래량 0이며 시가·고가·저가가 모두 0인 날에는 종가를 유지하되 일봉은 만들지 않습니다.

## 권장 구성: 별도 비공개 데이터 저장소

공개 코드는 `YKshin92/SupplyKRX`, 데이터 저장소는 별도 **Private** 저장소를 사용합니다. 예약 작업은 비공개 저장소 안에서 실행하며 그 저장소의 기본 `GITHUB_TOKEN`으로만 데이터를 저장합니다. 공개 저장소에 비공개 저장소 쓰기 토큰을 넣을 필요가 없습니다.

1. `SupplyKRX-data`라는 비공개 저장소를 README와 함께 생성합니다.
2. `templates/private-data-workflow.yml`을 비공개 저장소의 `.github/workflows/collect.yml`로 복사합니다.
3. 비공개 저장소 Actions Secrets에 `KRX_ID`, `KRX_PW`를 등록합니다.
4. 최초 로컬 자료 `data/live/`를 비공개 저장소에 넣습니다. 넣지 않으면 첫 실행에서 최근 20거래일을 수집합니다.
5. Actions Variable `COLLECTION_ENABLED=true`를 설정하고 `Daily pension and foreign data`를 수동 실행하여 성공 여부를 확인합니다.
6. 이후 한국 시간 평일 18:17, 20:17에 두 투자자·전체 보통주·OHLC·시가총액·업종을 갱신합니다. 주말/휴장일 신규 거래 자료는 만들지 않습니다.

로컬 화면 갱신: 비공개 저장소를 인증된 Git으로 clone/pull한 뒤 공개 코드 폴더에서 `python scripts/prepare-local.py --root <비공개저장소경로>`를 실행하고 다시 빌드합니다. 공개 홈페이지에 개인 데이터를 노출하지 않으며 로컬 화면이 자동으로 원격 저장소를 읽지는 않습니다.
