# SupplyKRX 자동매매 봇 설치 (Windows, 관리자 권한 필요 없음)
# 실행: PowerShell 에서  powershell -ExecutionPolicy Bypass -File install.ps1 [-Commit <공개 저장소 커밋>]
# - 앱 코드: %USERPROFILE%\supplykrx-trader\app\trader  (공개 저장소에서 받음, 키·계좌 정보 없음)
# - 키: %USERPROFILE%\.nhplug\.env  (이 스크립트가 묻는 칸에 직접 입력, 본인 계정만 읽기)
# - 설정·장부·기록: %USERPROFILE%\.supplykrx-trader  (config.json 기본 mode = shadow: 실제 시세 + 가상 체결, 주문 없음)
param([string]$Commit = 'main')
$ErrorActionPreference = 'Stop'
$Root  = Join-Path $env:USERPROFILE 'supplykrx-trader'
$State = Join-Path $env:USERPROFILE '.supplykrx-trader'
New-Item -ItemType Directory -Force -Path $Root, $State | Out-Null
function Write-NoBom([string]$Path, [string[]]$Lines) { [System.IO.File]::WriteAllLines($Path, $Lines, (New-Object System.Text.UTF8Encoding($false))) }

Write-Host '1/5 Python 확인'
if (-not (Get-Command py -ErrorAction SilentlyContinue)) { throw 'Python 이 없습니다. python.org 에서 Python 3.12 를 설치(“py launcher” 포함)한 뒤 다시 실행하세요.' }
& py -3 -c "import sys; assert sys.version_info >= (3, 11), 'Python 3.11 이상이 필요합니다: ' + sys.version"

Write-Host "2/5 앱 코드 받기 ($Commit)"
$zip = Join-Path $env:TEMP 'supplykrx-app.zip'; $tmp = Join-Path $env:TEMP 'supplykrx-app'
Invoke-WebRequest "https://codeload.github.com/YKshin92/SupplyKRX/zip/$Commit" -OutFile $zip -UseBasicParsing
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
Expand-Archive $zip $tmp
$src = (Get-ChildItem $tmp -Directory | Select-Object -First 1).FullName
$app = Join-Path $Root 'app'
Remove-Item -Recurse -Force $app -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $app | Out-Null
Copy-Item -Recurse (Join-Path $src 'trader') (Join-Path $app 'trader')
Copy-Item (Join-Path $src 'trader\windows\run.cmd') (Join-Path $Root 'run.cmd') -Force

Write-Host '3/5 가상환경과 나무 PLUG 공식 SDK 설치'
& py -3 -m venv (Join-Path $Root '.venv')
$vpy = Join-Path $Root '.venv\Scripts\python.exe'
& $vpy -m pip install --quiet --upgrade pip
& $vpy -m pip install --quiet requests 'https://github.com/PLUG-OpenAPI/nhplug-sdk/archive/refs/heads/main.zip'

Write-Host '4/5 설정 파일'
$cfg = Join-Path $State 'config.json'
if (-not (Test-Path $cfg)) {
  Write-NoBom $cfg @('{', '  "mode": "shadow",', '  "account": "",', '  "account_type": "03",', '  "daily_max_buy": 10000000,', '  "initial_cash": 20000000', '}')
  Write-Host "   $cfg 를 만들었습니다(mode shadow: 주문 없음). 모의 계좌번호(account)는 연결 시험 뒤 넣습니다."
}

Write-Host '5/5 키·토큰 (처음 한 번, 이 PC에만 저장)'
$envDir = Join-Path $env:USERPROFILE '.nhplug'; $envFile = Join-Path $envDir '.env'
if (-not (Test-Path $envFile)) {
  New-Item -ItemType Directory -Force -Path $envDir | Out-Null
  $key = Read-Host '   나무 PLUG APP KEY 붙여 넣기'
  $sec = Read-Host '   나무 PLUG APP SECRET 붙여 넣기(화면에 안 보임)' -AsSecureString
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  Write-NoBom $envFile @("NHPLUG_APP_KEY=$key", "NHPLUG_APP_SECRET=$plain", 'NHPLUG_BASE_URL=https://moapi.nhplug.com:8443', 'NHPLUG_AUTH_URL=https://api.nhplug.com:8443', 'NHPLUG_INSTRUMENTS_BASE=https://www.nhplug.com/instruments')
  $plain = $null
  icacls $envFile /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
  Write-Host "   $envFile 에 저장했습니다(모의투자 서버 moapi 로 설정, 본인 계정만 읽기)."
} else { Write-Host "   $envFile 가 이미 있어 그대로 둡니다." }
if (-not [Environment]::GetEnvironmentVariable('SUPPLYKRX_TRADER_TOKEN', 'User')) {
  $tok = Read-Host '   사이트 연결용 GitHub 토큰(SupplyKRX-data · Contents 읽기/쓰기). 아직 없으면 그냥 Enter' -AsSecureString
  $t = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($tok))
  if ($t) { [Environment]::SetEnvironmentVariable('SUPPLYKRX_TRADER_TOKEN', $t, 'User'); Write-Host '   사용자 환경 변수 SUPPLYKRX_TRADER_TOKEN 에 저장했습니다.' }
  $t = $null
}
Write-Host ''
Write-Host '설치 완료. 다음: 연결 시험(주문 없음)  ->  cd "$env:USERPROFILE\supplykrx-trader\app"; & "$env:USERPROFILE\supplykrx-trader\.venv\Scripts\python.exe" -X utf8 -m trader.check'
Write-Host '자동 실행 등록은 register-task.ps1 (평일 08:40 과 로그온 때 시작).'
