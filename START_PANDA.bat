@echo off
title Panda Engine v3.0
echo ========================================
echo   PANDA ENGINE v3.0
echo ========================================
echo.
echo Canonical workspace:
echo C:\Users\Admin\Documents\Claude\Projects\Panda Engine
echo.
echo Keep only ONE Panda Engine terminal open.
echo Press Ctrl+C to stop.
echo.
cd /d "C:\Users\Admin\Documents\Claude\Projects\Panda Engine"
py -3.11 -m uvicorn app:app --host 0.0.0.0 --port 8000
echo.
echo Panda Engine stopped.
pause
