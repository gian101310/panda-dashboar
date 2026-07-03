@echo off
title Panda Guardian Watchdog
cd /d "%~dp0"

:: ============================================
::  PANDA GUARDIAN WATCHDOG
::  Keeps autonomous-loop.mjs --daemon alive.
::  Restarts on crash with 15s cooldown.
::  Writes .watchdog.pid for dashboard tracking.
:: ============================================

echo ========================================
echo   PANDA GUARDIAN WATCHDOG
echo   Started: %date% %time%
echo ========================================
echo.

:: Write our PID so the dashboard can track us
:: Windows bat doesn't expose its own PID easily,
:: so we write a sentinel file with timestamp.
echo %date% %time% > .watchdog.pid

:: Create/clear log file
echo [%date% %time%] Watchdog started >> guardian-watchdog.log

set RESTART_COUNT=0

:loop
set /a RESTART_COUNT+=1
echo [%date% %time%] === Pass #%RESTART_COUNT% === Starting autonomous loop...
echo [%date% %time%] Pass #%RESTART_COUNT% started >> guardian-watchdog.log

:: Update heartbeat file before each pass
echo %date% %time% > .watchdog.heartbeat

:: Run the daemon — blocks until crash/exit
node tools/autonomous-loop.mjs --daemon 2>&1

set EXIT_CODE=%ERRORLEVEL%
echo.
echo [%date% %time%] Process exited with code %EXIT_CODE%.
echo [%date% %time%] Exited code=%EXIT_CODE% >> guardian-watchdog.log

:: If exit code 0 and user explicitly stopped, check for stop signal
if exist .watchdog.stop (
    echo [%date% %time%] Stop signal detected. Shutting down watchdog.
    echo [%date% %time%] Stopped by dashboard >> guardian-watchdog.log
    del .watchdog.stop 2>nul
    del .watchdog.pid 2>nul
    del .watchdog.heartbeat 2>nul
    exit /b 0
)

echo [%date% %time%] Restarting in 15 seconds... (Ctrl+C to stop)
echo [%date% %time%] Waiting 15s before restart >> guardian-watchdog.log

:: Update heartbeat even during cooldown
echo %date% %time% COOLDOWN > .watchdog.heartbeat

timeout /t 15 /nobreak >nul

goto loop
