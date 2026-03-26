# add_strength_btn_v2.ps1
# Run from: C:\Users\Admin\panda-dashboard\

$content = Get-Content pages\dashboard.js -Raw -Encoding UTF8

# Match the end of the journal button - single closing brace
$old = "cursor:'pointer'}}>" + [char]0xD83D + [char]0xDCD3 + " JOURNAL</button>}"
$new = "cursor:'pointer'}}>" + [char]0xD83D + [char]0xDCD3 + " JOURNAL</button>}`n            <button onClick={()=>window.location.href='/strength'} style={{background:'rgba(78,154,241,0.06)',border:'1px solid #4e9af133',borderRadius:5,color:'#4e9af1',fontFamily:mono,fontSize:9,padding:'5px 10px',cursor:'pointer'}}>STRENGTH</button>"

if ($content.Contains($old)) {
    $updated = $content.Replace($old, $new)
    [System.IO.File]::WriteAllText((Join-Path (Get-Location) "pages\dashboard.js"), $updated, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS!" -ForegroundColor Green
} else {
    # Try matching just the unique tail without emoji
    $old2 = "padding:'5px 10px',cursor:'pointer'}}> JOURNAL</button>}"
    $new2 = "padding:'5px 10px',cursor:'pointer'}}> JOURNAL</button>}`n            <button onClick={()=>window.location.href='/strength'} style={{background:'rgba(78,154,241,0.06)',border:'1px solid #4e9af133',borderRadius:5,color:'#4e9af1',fontFamily:mono,fontSize:9,padding:'5px 10px',cursor:'pointer'}}>STRENGTH</button>"
    
    # Strip emoji from file content for matching
    $stripped = $content -replace '[^\x00-\x7F]', '?'
    $pos = $stripped.IndexOf("padding:'5px 10px',cursor:'pointer'}}> JOURNAL</button>}")
    
    if ($pos -ge 0) {
        $updated = $content.Substring(0, $pos) + $new2 + $content.Substring($pos + $old2.Length)
        [System.IO.File]::WriteAllText((Join-Path (Get-Location) "pages\dashboard.js"), $updated, [System.Text.Encoding]::UTF8)
        Write-Host "SUCCESS (stripped match)!" -ForegroundColor Green
    } else {
        Write-Host "ERROR: Still no match. Dumping journal line for debug:" -ForegroundColor Red
        $content -split "`n" | Where-Object { $_ -match "JOURNAL" } | ForEach-Object { Write-Host $_ }
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
    Write-Host "PUSHED!" -ForegroundColor Yellow
} else {
    Write-Host "ERROR: Verify failed." -ForegroundColor Red
}