# Restart the (hidden) Panda engine so it loads the current app.py.
# Kills the running engine + its supervisor, then relaunches START_PANDA.bat HIDDEN.
# The engine window is intentionally invisible (watchdog runs it in the background),
# so this is the supported way to apply code changes without a terminal.
$root = 'C:\Users\Admin\Documents\Claude\Projects\Panda Engine'

$procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $_.CommandLine -and
  ($_.CommandLine -match 'uvicorn app:app' -or $_.CommandLine -match 'START_PANDA') -and
  ($_.CommandLine -notmatch 'RESTART_ENGINE|WATCH_PANDA')
}

$portPids = @(Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique)
$portProcs = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $portPids -contains $_.ProcessId })

$allProcs = @(@($procs) + @($portProcs)) | Sort-Object ProcessId -Unique
foreach($p in $allProcs){
  try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; Write-Output ("stopped pid " + $p.ProcessId) } catch {}
}
foreach($portPid in $portPids){
  try { Stop-Process -Id $portPid -Force -ErrorAction Stop; Write-Output ("stopped port pid " + $portPid) } catch {}
}

Start-Sleep -Seconds 2
Start-Process -FilePath 'cmd.exe' `
  -ArgumentList '/c', ('"' + (Join-Path $root 'START_PANDA.bat') + '"') `
  -WorkingDirectory $root -WindowStyle Hidden
Write-Output "relaunched START_PANDA.bat (hidden)"

# Wait for uvicorn to bind and report status
$status = 'starting...'
for($i=0; $i -lt 12; $i++){
  Start-Sleep -Seconds 3
  try { $status = (Invoke-RestMethod -Uri 'http://127.0.0.1:8000/status' -TimeoutSec 6).status; if($status){ break } } catch {}
}
Write-Output ("engine /status = " + $status)
