# SupplyKRX 자동매매 봇을 작업 스케줄러에 등록(본인 계정, 관리자 권한 필요 없음).
# 평일 08:40 과 로그온 때 시작하고, 이미 돌고 있으면 새로 시작하지 않습니다. 장 마감 뒤 신호 반영까지 하고 스스로 끝납니다.
# 지우기: Unregister-ScheduledTask -TaskName 'SupplyKRX Trader' -Confirm:$false
$ErrorActionPreference = 'Stop'
$cmd = Join-Path $env:USERPROFILE 'supplykrx-trader\run.cmd'
if (-not (Test-Path $cmd)) { throw "먼저 install.ps1 을 실행하세요($cmd 없음)." }
New-Item -ItemType Directory -Force -Path (Join-Path $env:USERPROFILE '.supplykrx-trader\logs') | Out-Null
$action   = New-ScheduledTaskAction -Execute $cmd
$weekdays = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At 8:40am
$logon    = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 15)
Register-ScheduledTask -TaskName 'SupplyKRX Trader' -Action $action -Trigger $weekdays,$logon -Settings $settings -Description 'SupplyKRX 연기금 매매법 자동매매 봇 (모의투자 기본)' -Force | Out-Null
Write-Host "등록했습니다: 작업 스케줄러 > 'SupplyKRX Trader'. 장중에는 노트북 절전·덮개 닫기로 멈추지 않게 해 주세요."
