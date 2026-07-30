@echo off
REM Double-click to restart the hidden Panda engine and load the latest app.py.
REM (Claude also runs RESTART_ENGINE.ps1 automatically after any engine code change.)
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Admin\Documents\Claude\Projects\Panda Engine\RESTART_ENGINE.ps1"
timeout /t 4 >nul
