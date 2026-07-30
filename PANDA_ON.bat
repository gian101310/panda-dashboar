@echo off
title PANDA ON
echo Enabling watchdog and starting Panda Engine...
schtasks /change /tn "\Panda Engine Watchdog" /enable >nul 2>&1
call "C:\Users\Admin\Documents\Claude\Projects\Panda Engine\WATCH_PANDA.bat"
timeout /t 15 /nobreak >nul
powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/status' -TimeoutSec 10; Write-Host ('ENGINE: ' + $r.status) -ForegroundColor Green } catch { Write-Host 'ENGINE: still starting - check again in 30s' -ForegroundColor Yellow }"
pause
