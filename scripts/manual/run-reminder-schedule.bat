@echo off
setlocal
set "URL=http://localhost:4000/api/reminders/run-schedule"
if /I "%~1"=="--check" goto check
curl.exe --fail --silent --show-error --connect-timeout 10 --max-time 1800 --request POST --header "X-Sinobisnis-Task: 1" --header "Content-Type: application/json" --data "{}" "%URL%"
exit /b %ERRORLEVEL%

:check
curl.exe --fail --silent --show-error --connect-timeout 10 --max-time 15 "%URL%"
exit /b %ERRORLEVEL%
