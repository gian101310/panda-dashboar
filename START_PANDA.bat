@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Panda Engine v3.0 [Auto-Restart]
cd /d "C:\Users\Admin\Documents\Claude\Projects\Panda Engine"

set RESTART_DELAY=15
set STARTUP_ERROR_DELAY=60

:LOOP
echo ========================================
echo   PANDA ENGINE v3.0
echo ========================================
echo Canonical workspace:
echo C:\Users\Admin\Documents\Claude\Projects\Panda Engine
echo Started: %date% %time%
echo Keep only ONE Panda Engine terminal open.
echo Press Ctrl+C twice or close this window to stop.
echo.

for /f "tokens=1-3 delims=:." %%a in ("%time: =0%") do (
    set /a START_SEC=%%a*3600+%%b*60+%%c
)

py -3.11 -m uvicorn app:app --host 0.0.0.0 --port 8000

set EXIT_CODE=%ERRORLEVEL%
for /f "tokens=1-3 delims=:." %%a in ("%time: =0%") do (
    set /a END_SEC=%%a*3600+%%b*60+%%c
)
set /a RUNTIME=!END_SEC!-!START_SEC!
if !RUNTIME! LSS 0 set /a RUNTIME=!RUNTIME!+86400

echo.
echo ========================================
echo   PANDA ENGINE EXITED
echo ========================================
echo Exit code: !EXIT_CODE!
echo Runtime seconds: !RUNTIME!
echo Stopped: %date% %time%
echo.

if !RUNTIME! LSS 60 (
    echo Startup failed quickly. Waiting %STARTUP_ERROR_DELAY% seconds before retry.
    timeout /t %STARTUP_ERROR_DELAY% /nobreak
) else (
    echo Restarting in %RESTART_DELAY% seconds.
    timeout /t %RESTART_DELAY% /nobreak
)

goto LOOP
