@echo off
title PANDA OFF
echo Disabling watchdog (so it will not auto-restart)...
schtasks /change /tn "\Panda Engine Watchdog" /disable >nul 2>&1
echo Stopping Panda Engine...
powershell -NoProfile -Command "$pids = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($p in $pids) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'START_PANDA' -and $_.Name -eq 'cmd.exe' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
echo.
echo ENGINE STOPPED. Watchdog disabled - it will STAY off.
echo Double-click PANDA_ON.bat to turn everything back on.
pause
