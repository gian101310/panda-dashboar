# add_strength_btn.ps1 — Add STRENGTH nav button to dashboard header
# Run from: C:\Users\Admin\panda-dashboard\

$content = Get-Content pages\dashboard.js -Raw -Encoding UTF8

# Find the exact pattern without emoji (match on the unique surrounding text)
$oldPattern = 'window.location.href=''/journal'''
$newText = 'window.location.href=''/journal'''

if ($content -notmatch [regex]::Escape($oldPattern)) {
    Write-Host "ERROR: Could not find journal button pattern!" -ForegroundColor Red
    Write-Host "Searching for nearby text..." -ForegroundColor Yellow
    $lines = Get-Content pages\dashboard.js
    $lines | Select-String "journal|JOURNAL" | ForEach-Object { Write-Host $_ }
    exit 1
}

# The replacement — insert STRENGTH button after the closing of the journal button block
$old = "window.location.href='/journal'} style={{background:'rgba(255,209,102,0.06)',border:'1px solid #ffd16633',borderRadius:5,color:'#ffd166',fontFamily:mono,fontSize:9,padding:'5px 10px',cursor:'pointer'}}>" + [char]0xD83D + [char]0xDCD3 + " JOURNAL</button>}}"
$new = "window.location.href='/journal'} style={{background:'rgba(255,209,102,0.06)',border:'1px solid #ffd16633',borderRadius:5,color:'#ffd166',fontFamily:mono,fontSize:9,padding:'5px 10px',cursor:'pointer'}}>" + [char]0xD83D + [char]0xDCD3 + " JOURNAL</button>}`n            <button onClick={()=>window.location.href='/strength'} style={{background:'rgba(78,154,241,0.06)',border:'1px solid #4e9af133',borderRadius:5,color:'#4e9af1',fontFamily:mono,fontSize:9,padding:'5px 10px',cursor:'pointer'}}>STRENGTH</button>"

if ($content.Contains($old)) {
    $updated = $content.Replace($old, $new)
    [System.IO.File]::WriteAllText((Join-Path (Get-Location) "pages\dashboard.js"), $updated, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: STRENGTH button added!" -ForegroundColor Green
} else {
    Write-Host "Pattern not found. Trying simpler approach..." -ForegroundColor Yellow
    
    # Simpler: just find the closing of the journal conditional and append after
    $simple_old = "JOURNAL</button>}}"
    $simple_new = "JOURNAL</button>}`n            <button onClick={()=>window.location.href='/strength'} style={{background:'rgba(78,154,241,0.06)',border:'1px solid #4e9af133',borderRadius:5,color:'#4e9af1',fontFamily:mono,fontSize:9,padding:'5px 10px',cursor:'pointer'}}>STRENGTH</button>"
    
    if ($content.Contains($simple_old)) {
        $updated = $content.Replace($simple_old, $simple_new)
        [System.IO.File]::WriteAllText((Join-Path (Get-Location) "pages\dashboard.js"), $updated, [System.Text.Encoding]::UTF8)
        Write-Host "SUCCESS (simple match): STRENGTH button added!" -ForegroundColor Green
    } else {
        Write-Host "ERROR: Could not match pattern. Paste line 873 content here." -ForegroundColor Red
        Get-Content pages\dashboard.js | Select-Object -Index 872
        exit 1
    }
}

# Verify
$check = Select-String -Path pages\dashboard.js -Pattern "STRENGTH</button>"
if ($check) {
    Write-Host "VERIFIED: $check" -ForegroundColor Green
    git add -f pages\dashboard.js
    git commit -m "feat: add STRENGTH nav button to dashboard header"
    git push
    Write-Host "PUSHED! Check https://panda-dashboar.vercel.app/dashboard" -ForegroundColor Yellow
} else {
    Write-Host "ERROR: Button not found after edit. Check manually." -ForegroundColor Red
}