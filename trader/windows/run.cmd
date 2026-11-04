@echo off
rem SupplyKRX trader: one trading day (Task Scheduler runs this on weekdays 08:40 and at logon). Logs: %USERPROFILE%\.supplykrx-trader\logs
if not exist "%USERPROFILE%\.supplykrx-trader\logs" mkdir "%USERPROFILE%\.supplykrx-trader\logs"
cd /d "%USERPROFILE%\supplykrx-trader\app"
"%USERPROFILE%\supplykrx-trader\.venv\Scripts\python.exe" -X utf8 -m trader.run >> "%USERPROFILE%\.supplykrx-trader\logs\run-console.log" 2>&1
