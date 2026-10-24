$ErrorActionPreference = 'Stop'

$signingDir = Join-Path $env:USERPROFILE '.bubblewrap\pandaengine-signing'
$keyPath = Join-Path $signingDir 'release.keystore'
$passwordPath = Join-Path $signingDir 'signing-password.txt'

if (-not (Test-Path -LiteralPath $keyPath) -or -not (Test-Path -LiteralPath $passwordPath)) {
    throw "Panda Android signing files are missing from $signingDir"
}

$previousStorePassword = $env:BUBBLEWRAP_KEYSTORE_PASSWORD
$previousKeyPassword = $env:BUBBLEWRAP_KEY_PASSWORD

try {
    $password = (Get-Content -LiteralPath $passwordPath -Raw).Trim()
    $env:BUBBLEWRAP_KEYSTORE_PASSWORD = $password
    $env:BUBBLEWRAP_KEY_PASSWORD = $password
    Push-Location $PSScriptRoot
    try {
        & bubblewrap build --signingKeyPath=$keyPath --signingKeyAlias=pandaengine
        if ($LASTEXITCODE -ne 0) { throw "Bubblewrap build failed with exit code $LASTEXITCODE" }
    } finally {
        Pop-Location
    }
} finally {
    $env:BUBBLEWRAP_KEYSTORE_PASSWORD = $previousStorePassword
    $env:BUBBLEWRAP_KEY_PASSWORD = $previousKeyPassword
}
