$ErrorActionPreference = 'Stop'
$repoPath = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $repoPath '.journal-sync-task.log'

try {
    Set-Location -LiteralPath $repoPath
    $nodePath = (Get-Command node.exe).Source
    $scriptPath = Join-Path $PSScriptRoot 'journal-sync-agent.mjs'
    $output = & $nodePath $scriptPath --write --account=2243677 --count=200 --quiet 2>&1
    $exitCode = $LASTEXITCODE
    @((Get-Date -Format o), $output, "Exit code: $exitCode") | Set-Content -LiteralPath $logPath
    exit $exitCode
} catch {
    @((Get-Date -Format o), $_.Exception.Message, 'Exit code: 1') | Set-Content -LiteralPath $logPath
    exit 1
}
