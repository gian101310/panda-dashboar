# ============================================
# PANDA ENGINE — Patch Login Alert into index.js
# ============================================
# Adds Telegram login alert to the login handler
# Just run this script — no editing needed
# ============================================

cd C:\Users\Admin\panda-dashboard

$file = "pages\index.js"
$content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

$oldCode = "window.location.href = d.role === 'admin' ? '/admin' : '/dashboard';"
$newCode = @"
// Telegram login alert (non-blocking)
            fetch('http://2.51.11.146:8000/api/login-alert', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: username })
            }).catch(() => {});
            window.location.href = d.role === 'admin' ? '/admin' : '/dashboard';
"@

if ($content.Contains($oldCode)) {
    $content = $content.Replace($oldCode, $newCode)
    [System.IO.File]::WriteAllText($file, $content, [System.Text.Encoding]::UTF8)
    Write-Host "[OK] Login alert fetch added to index.js" -ForegroundColor Green
} else {
    Write-Host "[WARN] Could not find redirect pattern — checking alternate pattern..." -ForegroundColor Yellow

    $altOld = "window.location.href = d.role === `"admin`" ? `"/admin`" : `"/dashboard`";"
    if ($content.Contains($altOld)) {
        $content = $content.Replace($altOld, $newCode)
        [System.IO.File]::WriteAllText($file, $content, [System.Text.Encoding]::UTF8)
        Write-Host "[OK] Login alert fetch added (alt pattern)" -ForegroundColor Green
    } else {
        Write-Host "[ERROR] Could not find login redirect in index.js" -ForegroundColor Red
        Write-Host "Please paste the line that contains 'window.location.href' from your index.js" -ForegroundColor Yellow
    }
}

git add pages\index.js
git commit -m "Add Telegram login alert to dashboard"
git push origin main

Write-Host "`n[DONE] Frontend deployed — now restart your engine!" -ForegroundColor Cyan
