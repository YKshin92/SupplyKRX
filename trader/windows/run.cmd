@echo off
rem SupplyKRX trader: one trading day (Task Scheduler runs this on weekdays 08:40 and at logon). Logs: %USERPROFILE%\.supplykrx-trader\logs
rem If the bot stops with an error it restarts after 60 s (up to 30 times); the book on disk lets it resume (no buys after 09:10).
if not exist "%USERPROFILE%\.supplykrx-trader\logs" mkdir "%USERPROFILE%\.supplykrx-trader\logs"
cd /d "%USERPROFILE%\supplykrx-trader\app"
set tries=0
:again
"%USERPROFILE%\supplykrx-trader\.venv\Scripts\python.exe" -X utf8 -m trader.run >> "%USERPROFILE%\.supplykrx-trader\logs\run-console.log" 2>&1
if %errorlevel%==0 goto :eof
set /a tries+=1
if %tries% geq 30 goto :eof
echo [%date% %time%] bot stopped with an error, restarting in 60 s (%tries%/30) >> "%USERPROFILE%\.supplykrx-trader\logs\run-console.log"
timeout /t 60 /nobreak >nul
goto again
