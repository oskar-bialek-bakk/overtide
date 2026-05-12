@echo off
REM Start Overtide api + web in two separate cmd windows.
REM Kills any leftover bun/node first so a stale vite worker doesn't grab the port.
REM Usage:
REM   dev.cmd              — kill stragglers, start both
REM   dev.cmd --no-reset   — skip the kill step
REM   dev.cmd --kill       — only kill, don't start

setlocal

set DO_KILL=1
set DO_START=1

if "%1"=="--no-reset" set DO_KILL=0
if "%1"=="--kill" set DO_START=0

if "%DO_KILL%"=="1" (
  echo [dev] killing leftover bun/node processes...
  taskkill /F /IM node.exe >nul 2>&1
  taskkill /F /IM bun.exe >nul 2>&1
  taskkill /F /IM bunx.exe >nul 2>&1
  REM Give the OS a moment to release port 5173.
  timeout /t 1 /nobreak >nul
)

if "%DO_START%"=="0" (
  echo [dev] kill-only mode, exiting.
  goto :eof
)

echo [dev] starting api on :8787 ...
start "overtide-api" cmd /k "cd /d %~dp0 && bun --filter @overtide/api dev"

echo [dev] starting web on :5173 ...
start "overtide-web" cmd /k "cd /d %~dp0 && bun --filter @overtide/web dev"

echo.
echo [dev] both windows launched.
echo       api ^> http://127.0.0.1:8787
echo       web ^> http://127.0.0.1:5173
echo.
echo       to stop both: dev.cmd --kill
endlocal
