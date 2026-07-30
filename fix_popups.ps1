# Stops the every-5-min terminal pop-ups by making the watchdog + autopull
# scheduled tasks run in the background (no visible console window).
# Must run elevated (the launcher .bat handles that).
$ErrorActionPreference = 'Continue'
$tasks = @('Panda Engine Watchdog','PandaAutoPull')
foreach($n in $tasks){
  try {
    $p = New-ScheduledTaskPrincipal -UserId 'Admin' -LogonType S4U -RunLevel Limited
    Set-ScheduledTask -TaskName $n -Principal $p | Out-Null
    $lt = (Get-ScheduledTask -TaskName $n).Principal.LogonType
    Write-Host ("OK  - " + $n + "  (LogonType now = " + $lt + ")") -ForegroundColor Green
  } catch {
    Write-Host ("FAILED - " + $n + " : " + $_.Exception.Message) -ForegroundColor Red
  }
}
Write-Host ""
Write-Host "Done. The watchdog and auto-pull will no longer pop a terminal every 5 minutes."
Write-Host "The engine keeps running normally; this only hides the 5-minute background checks."
Write-Host ""
Write-Host "Closing in 6 seconds..."
Start-Sleep -Seconds 6
