@echo off
setlocal
cd /d "%~dp0"

rem Start the existing Windows services only after verifying the production profile.
rem Database credentials stay in apps\api\.env; this file never contains secrets.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy\startup-production.ps1"
set "result=%ERRORLEVEL%"
if not "%result%"=="0" echo Startup failed. Review the message above.
exit /b %result%
