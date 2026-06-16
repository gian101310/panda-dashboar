$ErrorActionPreference = "Stop"

function Assert-File($Path) {
  if (!(Test-Path -LiteralPath $Path)) {
    throw "Missing required file: $Path"
  }
}

function Assert-Contains($Path, $Pattern, $Message) {
  $content = Get-Content -LiteralPath $Path -Raw
  if ($content -notmatch $Pattern) {
    throw $Message
  }
}

function Assert-NotContains($Path, $Pattern, $Message) {
  $content = Get-Content -LiteralPath $Path -Raw
  if ($content -match $Pattern) {
    throw $Message
  }
}

$root = Resolve-Path "."
$required = @(
  "lib\indicatorProducts.mjs",
  "lib\indicatorLicense.mjs",
  "pages\api\indicator-license-request.js",
  "lib\indicatorRequestAlert.mjs",
  "pages\api\indicator-license.js",
  "pages\api\admin\indicator-licenses.js",
  "pages\admin\license.js",
  "supabase\indicator_licenses.sql",
  "public\downloads\scoring-v3.ex4",
  "public\downloads\panda-full-v3-indicator.ex4"
)

foreach ($path in $required) { Assert-File $path }

Assert-Contains "lib\indicatorProducts.mjs" "scoring_v3" "Product config must include scoring_v3"
Assert-Contains "lib\indicatorProducts.mjs" "panda_full_v3" "Product config must include panda_full_v3"
Assert-Contains "lib\indicatorProducts.mjs" "/downloads/scoring-v3.ex4" "Product config must include scoring v3 download"
Assert-Contains "lib\indicatorProducts.mjs" "/downloads/panda-full-v3-indicator.ex4" "Product config must include full v3 download"
Assert-Contains "lib\indicatorLicense.mjs" "decideIndicatorLicense" "License helper must expose decision logic"

Assert-Contains "pages\api\indicator-license-request.js" "PENDING" "Public request API must create pending requests"
Assert-Contains "pages\api\indicator-license-request.js" "sendIndicatorRequestAlert" "Public request API must notify Telegram"
Assert-Contains "lib\indicatorRequestAlert.mjs" "LOGIN_ALERT_BOT_TOKEN" "Indicator request alert must reuse login alert bot config"
Assert-Contains "lib\indicatorRequestAlert.mjs" "/admin/license" "Indicator request alert must link admin license page"
Assert-Contains "pages\api\indicator-license.js" "OK\|APPROVED" "MT4 license API must return OK|APPROVED"
Assert-Contains "pages\api\indicator-license.js" "DENY\|" "MT4 license API must return DENY responses"
Assert-Contains "pages\api\admin\indicator-licenses.js" "requireAdmin" "Admin license API must require admin"
Assert-Contains "pages\api\admin\indicator-licenses.js" "paid_confirmed" "Admin API must manage paid confirmation"
Assert-Contains "pages\api\admin\indicator-licenses.js" "expires_at" "Admin API must manage expiry"

Assert-Contains "pages\admin\license.js" "LICENSE" "Admin license page must render license table"
Assert-Contains "pages\admin\license.js" "APPROVE" "Admin license page must have approve action"
Assert-Contains "pages\admin\index.js" "/admin/license" "Admin nav must link to license page"

Assert-Contains "pages\index.js" "indicator-license-request" "Landing page must submit indicator license requests"
Assert-Contains "pages\index.js" "product.downloadPath" "Landing page must link configured downloads"
Assert-Contains "pages\index.js" "REQUEST ACTIVATION" "Landing page must make activation request the main action"

$saleFiles = @(
  "panda-indicators\2026-06-16\v3-release\scoring v3.mq4",
  "panda-indicators\2026-06-16\v3-release\panda full v3 indicator.mq4"
)

foreach ($file in $saleFiles) {
  Assert-Contains $file "LicenseEndpoint" "$file must include hidden license endpoint"
  Assert-Contains $file "ValidateLicense" "$file must validate license"
  Assert-Contains $file "WebRequest" "$file must call WebRequest"
  Assert-Contains $file "INIT_FAILED" "$file must fail OnInit when unlicensed"
  Assert-NotContains $file "(?m)^input\s" "$file must not expose inputs"
}

Write-Host "Indicator license feature checks passed"
