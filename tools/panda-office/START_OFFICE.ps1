$ErrorActionPreference = 'Stop'
$officeDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$distFile = Join-Path $officeDir 'dist\index.html'
if (-not (Test-Path -LiteralPath $distFile)) {
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
