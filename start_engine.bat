@echo off
title Panda Engine v3.0 - Clean Auto Reload
echo ========================================
echo   PANDA ENGINE v3.0 - CLEAN TERMINAL
echo ========================================
echo.
echo Canonical workspace:
echo C:\Users\Admin\Documents\Claude\Projects\Panda Engine
echo.
echo Auto-reload is enabled. When app.py changes, uvicorn restarts.
echo Keep only ONE Panda Engine terminal open.
echo Press Ctrl+C to stop.
echo.
cd /d "C:\Users\Admin\Documents\Claude\Projects\Panda Engine"
py -3.11 -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload --reload-dir "C:\Users\Admin\Documents\Claude\Projects\Panda Engine"
echo.
echo Panda Engine stopped.
pause
