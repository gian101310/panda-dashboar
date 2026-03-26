# fix_canvas_draw.ps1 — Fix canvas rendering with ResizeObserver
# Run from: C:\Users\Admin\panda-dashboard\

$content = Get-Content pages\strength.js -Raw -Encoding UTF8

# 1. Change the draw effect dependencies to include a resize trigger
# Replace: }, [data, active, hovIdx]);
# With a ResizeObserver approach — we add a canvasSize state and observe

# First, add canvasSize state after hovIdx state
$old1 = '  const [hovIdx,      setHovIdx]      = useState(null);'
$new1 = '  const [hovIdx,      setHovIdx]      = useState(null);
  const [canvasSize,  setCanvasSize]  = useState({ w:0, h:0 });'

if ($content.Contains($old1)) {
    $content = $content.Replace($old1, $new1)
    Write-Host "STEP 1 OK: added canvasSize state" -ForegroundColor Green
} else {
    Write-Host "STEP 1 FAIL: could not find hovIdx state line" -ForegroundColor Red
    exit 1
}

# 2. Add ResizeObserver effect after the load useEffect
$old2 = '  useEffect(() => {
    fetch(''/api/me'').then'
$new2 = '  // ResizeObserver to trigger redraw once canvas has real dimensions
  useEffect(() => {
    if (!canvasRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        if (width > 0 && height > 0) setCanvasSize({ w: Math.round(width), h: Math.round(height) });
      }
    });
    ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    fetch(''/api/me'').then'

if ($content.Contains($old2)) {
    $content = $content.Replace($old2, $new2)
    Write-Host "STEP 2 OK: added ResizeObserver effect" -ForegroundColor Green
} else {
    Write-Host "STEP 2 FAIL: could not find fetch /api/me line" -ForegroundColor Red
    exit 1
}

# 3. Add canvasSize to draw effect dependencies
$old3 = '  }, [data, active, hovIdx]);'
$new3 = '  }, [data, active, hovIdx, canvasSize]);'

if ($content.Contains($old3)) {
    $content = $content.Replace($old3, $new3)
    Write-Host "STEP 3 OK: added canvasSize to draw deps" -ForegroundColor Green
} else {
    Write-Host "STEP 3 FAIL: could not find draw effect closing" -ForegroundColor Red
    exit 1
}

# Write file
[System.IO.File]::WriteAllText((Join-Path (Get-Location) "pages\strength.js"), $content, [System.Text.Encoding]::UTF8)
Write-Host "File written!" -ForegroundColor Green

# Verify
$check = Select-String -Path pages\strength.js -Pattern "canvasSize"
Write-Host "Verify: $($check.Count) matches for 'canvasSize'" -ForegroundColor Cyan

git add -f pages\strength.js
git commit -m "fix: use ResizeObserver to trigger canvas draw after layout"
git push
Write-Host "PUSHED! https://panda-dashboar.vercel.app/strength" -ForegroundColor Yellow