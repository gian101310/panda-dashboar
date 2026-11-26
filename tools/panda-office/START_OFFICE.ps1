$ErrorActionPreference = 'Stop'
$officeDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$distFile = Join-Path $officeDir 'dist\index.html'
$sourcePaths = @(
    (Join-Path $officeDir 'src'),
    (Join-Path $officeDir 'public'),
    (Join-Path $officeDir 'index.html'),
    (Join-Path $officeDir 'package.json'),
    (Join-Path $officeDir 'package-lock.json')
)
$needsBuild = -not (Test-Path -LiteralPath $distFile)
if (-not $needsBuild) {
    $builtAt = (Get-Item -LiteralPath $distFile).LastWriteTimeUtc
    foreach ($sourcePath in $sourcePaths) {
        $latest = Get-ChildItem -LiteralPath $sourcePath -File -Recurse | Where-Object { $_.LastWriteTimeUtc -gt $builtAt } | Select-Object -First 1
        if ($latest) { $needsBuild = $true; break }
    }
}
if ($needsBuild) {
    Write-Host 'Building Panda Office...'
    Push-Location $officeDir
    try {
        npm.cmd install
        if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
        npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'build failed' }
    } finally { Pop-Location }
}
$url = 'http://127.0.0.1:4318'
try {
    $response = Invoke-WebRequest -Uri "$url/api/health" -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -ne 200) { throw 'Viewer unavailable' }
} catch {
    Start-Process -FilePath 'node.exe' -ArgumentList 'server.mjs' -WorkingDirectory $officeDir -WindowStyle Hidden
    Start-Sleep -Seconds 2
}
Start-Process $url
