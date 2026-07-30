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
  "$startProcs = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -match 'Panda Engine' -and $_.CommandLine -match 'START_PANDA\.bat' -and $_.CommandLine -notmatch 'WATCH_PANDA|Get-CimInstance|hermes' });" ^
  "$portPids = @(Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique);" ^
  "$portProcs = @(Get-CimInstance Win32_Process | Where-Object { $portPids -contains $_.ProcessId });" ^
  "$procs = @($startProcs + $portProcs) | Sort-Object ProcessId -Unique;" ^
  "$healthy = $false;" ^
  "$statusDetail = 'NO_RESPONSE';" ^
  "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/status' -TimeoutSec 8; $statusDetail = [string]$r.status; $healthy = ($r.status -eq 'ACTIVE') } catch { $statusDetail = $_.Exception.Message };" ^
  "if ($healthy) { Add-Content -LiteralPath $log -Value \"$stamp OK healthy=True status=$statusDetail procs=$($procs.Count)\"; exit 0 };" ^
  "if ($procs.Count -gt 0) { Add-Content -LiteralPath $log -Value \"$stamp WARN healthy=False status=$statusDetail procs=$($procs.Count) action=keep_running\"; exit 0 };" ^
  "Add-Content -LiteralPath $log -Value \"$stamp RECOVER status=$statusDetail procs=$($procs.Count)\";" ^
  "foreach ($p in $procs) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; Add-Content -LiteralPath $log -Value \"$stamp STOPPED pid=$($p.ProcessId) name=$($p.Name)\" } catch { Add-Content -LiteralPath $log -Value \"$stamp STOP_FAIL pid=$($p.ProcessId) err=$($_.Exception.Message)\" } };" ^
  "Start-Sleep -Seconds 3;" ^
  "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', \"`\"$starter`\"\" -WorkingDirectory $root -WindowStyle Hidden;" ^
  "Add-Content -LiteralPath $log -Value \"$stamp STARTED Panda Engine via START_PANDA.bat\";" ^
  "exit 0"
