@echo off
setlocal EnableExtensions

set ROOT=C:\Users\Admin\Documents\Claude\Projects\Panda Engine
set STARTER=%ROOT%\START_PANDA.bat
set LOG=%ROOT%\watch_panda.log

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root = '%ROOT%';" ^
  "$starter = '%STARTER%';" ^
  "$log = '%LOG%';" ^
  "$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss';" ^
  "$procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'uvicorn app:app|START_PANDA\.bat' };" ^
  "$healthy = $false;" ^
  "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/status' -TimeoutSec 8; $healthy = ($r.status -eq 'ACTIVE') } catch { $healthy = $false };" ^
  "if ($healthy -or $procs) { Add-Content -LiteralPath $log -Value \"$stamp OK healthy=$healthy procs=$($procs.Count)\"; exit 0 };" ^
  "Add-Content -LiteralPath $log -Value \"$stamp STARTING Panda Engine via START_PANDA.bat\";" ^
  "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', \"`\"$starter`\"\" -WorkingDirectory $root;" ^
  "exit 0"
