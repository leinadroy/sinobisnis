@echo off
setlocal
cd /d "%~dp0"

rem Restart Sinobisnis on ports 4000/3001 after verifying the production profile.
rem Database credentials stay in apps\api\.env; this file never contains secrets.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\local\startup-production.ps1"
set "result=%ERRORLEVEL%"
if not "%result%"=="0" echo Startup failed. Review the message above.
exit /b %result%
