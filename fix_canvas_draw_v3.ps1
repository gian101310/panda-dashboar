# fix_canvas_draw_v3.ps1 — position-based insert, no pattern matching issues
# Run from: C:\Users\Admin\panda-dashboard\

$lines = [System.IO.File]::ReadAllLines((Join-Path (Get-Location) "pages\strength.js"), [System.Text.Encoding]::UTF8)

# Find the line index of the /api/me fetch useEffect
$targetLine = -1
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match "fetch\('/api/me'\)") {
        # Go back to find the useEffect( line above it
        for ($j = $i; $j -ge 0; $j--) {
            if ($lines[$j] -match "^\s*useEffect\(") {
                $targetLine = $j
                break
            }
        }
        break
    }
}

if ($targetLine -lt 0) {
    Write-Host "ERROR: could not find /api/me useEffect" -ForegroundColor Red
    exit 1
}

Write-Host "Found /api/me useEffect at line $($targetLine+1)" -ForegroundColor Cyan

# Build the ResizeObserver block to insert
$insert = @(
    '  // ResizeObserver — triggers redraw once canvas has real dimensions',
    '  useEffect(() => {',
    '    if (!canvasRef.current) return;',
    '    const ro = new ResizeObserver(entries => {',
    '      for (const e of entries) {',
    '        const { width, height } = e.contentRect;',
    '        if (width > 0 && height > 0) setCanvasSize({ w: Math.round(width), h: Math.round(height) });',
    '      }',
    '    });',
    '    ro.observe(canvasRef.current);',
    '    return () => ro.disconnect();',
    '  }, []);',
    ''
)

# Insert before the /api/me useEffect line
$newLines = $lines[0..($targetLine-1)] + $insert + $lines[$targetLine..($lines.Length-1)]

# Fix draw effect deps: [data, active, hovIdx] -> [data, active, hovIdx, canvasSize]
$newLines = $newLines | ForEach-Object {
    $_ -replace '\[data, active, hovIdx\]', '[data, active, hovIdx, canvasSize]'
}

# Write file
[System.IO.File]::WriteAllLines((Join-Path (Get-Location) "pages\strength.js"), $newLines, [System.Text.Encoding]::UTF8)
Write-Host "File written!" -ForegroundColor Green

# Verify
$check = (Select-String -Path pages\strength.js -Pattern "canvasSize").Count
Write-Host "canvasSize references found: $check" -ForegroundColor Cyan

if ($check -ge 2) {
    git add -f pages\strength.js
    git commit -m "fix: ResizeObserver triggers canvas draw after layout paint"
    git push
    Write-Host "PUSHED! https://panda-dashboar.vercel.app/strength" -ForegroundColor Yellow
} else {
    Write-Host "ERROR: canvasSize not found enough times, check file manually" -ForegroundColor Red
}