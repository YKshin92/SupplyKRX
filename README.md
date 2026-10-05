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

## GitHub Actions 설정

저장소 **Settings → Secrets and variables → Actions**:

| 종류 | 이름 | 설명 |
|---|---|---|
| Secret | `KRX_ID` | KRX 로그인 ID |
| Secret | `KRX_PW` | KRX 비밀번호 |
| Secret | `VERCEL_DEPLOY_HOOK` | 선택 사항. Vercel의 main 브랜치 Deploy Hook |
| Variable | `COLLECTION_ENABLED` | 수집 활성화 시 `true` |
| Variable | `DATA_PUBLISH_ALLOWED` | 실제 데이터 재배포 권한 확인 후에만 `true` |

수집 일정은 잠정적으로 한국 시간 평일 18:17 / 20:17입니다. 공급자의 확정 시점을 보장하는 설정이 아니며 최초 운영 때 확인해야 합니다. 예약은 지연·누락될 수 있으므로 수동 실행과 최근일 재수집을 함께 제공합니다.

**현재 공개 저장소에서는 실제 원자료를 자동 커밋하지 않도록 기본 비활성화되어 있습니다.** 최초 요청의 ‘공개 가능 여부 불명확한 원자료는 게시하지 않기’를 따릅니다. 비공개 저장소로 운영하거나 별도 데이터 이용 권한을 먼저 확인하세요. 비공개 저장소라고 Vercel 사이트까지 비공개가 되는 것은 아닙니다.

수집 활성화 후 **Actions → Collect pension flow → Run workflow**에서 먼저 5개 종목을 시험하세요. 날짜 입력은 셸 환경변수와 배열로 전달하며 셸 명령으로 평가하지 않습니다. 검증 실패 시 기존 파일을 커밋하지 않습니다. `GITHUB_TOKEN` 데이터 커밋의 후속 실행 제한을 고려해, 공개 게시가 허용된 경우 선택적 Deploy Hook으로 Vercel 갱신을 연결합니다.

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
- 매수·매도 미제공 시 순매수 0만으로 매매가 없었다고 판정하지 않습니다. 시장별 수급 응답에 없는 종목도 0으로 채우지 않습니다.
- 최근일 응답 누락과 과거 결측은 표시되며 불완전한 기간은 합계를 만들지 않습니다. 매일 순매수인 종목의 연속일은 관측 창의 하한값입니다.
- 종목 분류는 수집 당시 KRX 기본정보를 사용합니다. 신규 상장은 상장일 이전을 제외하지만 기간 중 상장폐지 종목의 완전 복원이나 과거 종목 구성 백테스트는 지원하지 않습니다.
- pykrx 웹 통계의 인증·스키마는 바뀔 수 있습니다. KRX/NXT 범위가 달라지면 어댑터와 출처 표시를 다시 검증해야 합니다. 임의 합산하지 않습니다.
- 현재 KRX 데이터의 재배포 권한을 확보했다는 의미가 아닙니다. 개인정보나 계정 정보는 데이터 파일에 포함하지 않습니다.

## 출처

- [pykrx 사용법·인증·주의사항](https://github.com/sharebook-kr/pykrx)
- [KRX 정보 수신·이용 안내](https://openapi.krx.co.kr/contents/OPP/DATA/OPPDATA003.jsp)
- [GitHub 예약 실행](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [Vercel Vite 배포](https://vercel.com/docs/frameworks/frontend/vite)
