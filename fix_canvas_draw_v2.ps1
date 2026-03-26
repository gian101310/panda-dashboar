# fix_canvas_draw_v2.ps1
# Run from: C:\Users\Admin\panda-dashboard\

$content = Get-Content pages\strength.js -Raw -Encoding UTF8

# 1. Add canvasSize state (already done in previous run — check first)
$old1 = '  const [hovIdx,      setHovIdx]      = useState(null);
  const [canvasSize,  setCanvasSize]  = useState({ w:0, h:0 });'
if ($content.Contains($old1)) {
    Write-Host "STEP 1: canvasSize already added, skipping" -ForegroundColor Yellow
} else {
    $old1b = '  const [hovIdx,      setHovIdx]      = useState(null);'
    $new1b = '  const [hovIdx,      setHovIdx]      = useState(null);
  const [canvasSize,  setCanvasSize]  = useState({ w:0, h:0 });'
    if ($content.Contains($old1b)) {
        $content = $content.Replace($old1b, $new1b)
        Write-Host "STEP 1 OK: added canvasSize state" -ForegroundColor Green
    } else {
        Write-Host "STEP 1 FAIL" -ForegroundColor Red; exit 1
    }
}

# 2. Insert ResizeObserver before the /api/me useEffect (no blank line version)
$old2 = '  useEffect(() => {
    fetch(''/api/me'').then(r => r.json()).then(d => {'
$new2 = '  // ResizeObserver — triggers redraw once canvas has real dimensions
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
    fetch(''/api/me'').then(r => r.json()).then(d => {'

if ($content.Contains($old2)) {
    $content = $content.Replace($old2, $new2)
    Write-Host "STEP 2 OK: added ResizeObserver" -ForegroundColor Green
} else {
    Write-Host "STEP 2 FAIL: pattern not found" -ForegroundColor Red; exit 1
}

# 3. Add canvasSize to draw effect deps
$old3 = '  }, [data, active, hovIdx]);'
$new3 = '  }, [data, active, hovIdx, canvasSize]);'
if ($content.Contains($old3)) {
    $content = $content.Replace($old3, $new3)
    Write-Host "STEP 3 OK: updated draw deps" -ForegroundColor Green
} else {
    Write-Host "STEP 3 FAIL: deps line not found" -ForegroundColor Red; exit 1
}

# Write + push
[System.IO.File]::WriteAllText((Join-Path (Get-Location) "pages\strength.js"), $content, [System.Text.Encoding]::UTF8)
Write-Host "File written!" -ForegroundColor Green

$check = (Select-String -Path pages\strength.js -Pattern "canvasSize").Count
Write-Host "canvasSize references: $check" -ForegroundColor Cyan

git add -f pages\strength.js
git commit -m "fix: ResizeObserver triggers canvas draw after layout paint"
git push
Write-Host "PUSHED! https://panda-dashboar.vercel.app/strength" -ForegroundColor Yellow