$ErrorActionPreference = "Stop"

$root = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$releaseDir = Join-Path $root "panda-indicators\2026-06-16\v3-release"

$sources = @(
  "scoring v3 input.mq4",
  "scoring v3.mq4",
  "panda full v3 indicator input.mq4",
  "panda full v3 indicator.mq4",
  "panda one v3 licensed.mq4",
  "panda bias scanner v4.mq4",
  "panda bias scanner v4 no license.mq4",
  "panda bias scanner v4 input no license.mq4"
)

$compiled = @(
  "scoring v3 input.ex4",
  "scoring v3.ex4",
  "panda full v3 indicator input.ex4",
  "panda full v3 indicator.ex4",
  "panda one v3 licensed.ex4",
  "panda bias scanner v4.ex4",
  "panda bias scanner v4 no license.ex4",
  "panda bias scanner v4 input no license.ex4"
)

foreach($name in $sources + $compiled) {
  $path = Join-Path $releaseDir $name
  if(-not (Test-Path -LiteralPath $path)) {
    throw "Missing required file: $path"
  }
}

$scoringInput = Get-Content -LiteralPath (Join-Path $releaseDir "scoring v3 input.mq4") -Raw
$scoringPrivate = Get-Content -LiteralPath (Join-Path $releaseDir "scoring v3.mq4") -Raw
$fullInput = Get-Content -LiteralPath (Join-Path $releaseDir "panda full v3 indicator input.mq4") -Raw
$fullPrivate = Get-Content -LiteralPath (Join-Path $releaseDir "panda full v3 indicator.mq4") -Raw
$pandaOneLicensed = Get-Content -LiteralPath (Join-Path $releaseDir "panda one v3 licensed.mq4") -Raw
$pandaBiasScanner = Get-Content -LiteralPath (Join-Path $releaseDir "panda bias scanner v4.mq4") -Raw
$pandaBiasScannerNoLicense = Get-Content -LiteralPath (Join-Path $releaseDir "panda bias scanner v4 no license.mq4") -Raw
$pandaBiasScannerInputNoLicense = Get-Content -LiteralPath (Join-Path $releaseDir "panda bias scanner v4 input no license.mq4") -Raw

if($scoringInput -notmatch "\binput\b") { throw "scoring v3 input.mq4 should expose inputs" }
if($fullInput -notmatch "\binput\b") { throw "panda full v3 indicator input.mq4 should expose inputs" }
if($pandaBiasScannerInputNoLicense -notmatch "\binput\b") { throw "panda bias scanner v4 input no license.mq4 should expose inputs" }
if($scoringPrivate -match "\binput\b") { throw "scoring v3.mq4 should not expose inputs" }
if($fullPrivate -match "\binput\b") { throw "panda full v3 indicator.mq4 should not expose inputs" }
if($pandaOneLicensed -match "\binput\b") { throw "panda one v3 licensed.mq4 should not expose inputs" }
if($pandaBiasScanner -match "\binput\b") { throw "panda bias scanner v4.mq4 should not expose inputs" }
if($pandaBiasScannerNoLicense -match "\binput\b") { throw "panda bias scanner v4 no license.mq4 should not expose inputs" }

foreach($pair in @(
  @{ name = "scoring input"; text = $scoringInput },
  @{ name = "scoring private"; text = $scoringPrivate },
  @{ name = "full input"; text = $fullInput },
  @{ name = "full private"; text = $fullPrivate }
)) {
  $text = $pair.text
  if($text -notmatch "WritePandaScoreFile") { throw "$($pair.name) missing score writer" }
  if($text -notmatch "WriteMt4File") { throw "$($pair.name) missing mt4 score export" }
  if($text -notmatch "DrawCurrentChartBoxes") { throw "$($pair.name) missing box drawing" }
  if($text -notmatch "RefreshSeconds\s*=\s*15") { throw "$($pair.name) should default RefreshSeconds to 15 to reduce chart load" }
}

if($scoringInput -match "CalculateSuperTrend|CalculateBBTrend|DrawAllSRZones") { throw "scoring v3 input should not include Panda Lines calculations" }
if($scoringPrivate -match "CalculateSuperTrend|CalculateBBTrend|DrawAllSRZones") { throw "scoring v3 private should not include Panda Lines calculations" }
if($fullInput -notmatch "CalculateSuperTrend|CalculateBBTrend|DrawAllSRZones") { throw "full input should include Panda Lines calculations" }
if($fullPrivate -notmatch "CalculateSuperTrend|CalculateBBTrend|DrawAllSRZones") { throw "full private should include Panda Lines calculations" }
if($pandaOneLicensed -notmatch "ValidateLicense") { throw "panda one v3 licensed should require license approval" }
if($pandaOneLicensed -notmatch 'ProductCode\s*=\s*"scoring_v3"') { throw "panda one v3 licensed should match Panda Directional Bias approvals" }
if($pandaOneLicensed -match "WagBox") { throw "panda one v3 licensed should use Panda Box wording only" }
if($pandaBiasScanner -notmatch "ValidateLicense") { throw "panda bias scanner should require license approval" }
if($pandaBiasScanner -notmatch 'ProductCode\s*=\s*"scoring_v3"') { throw "panda bias scanner should match Panda Directional Bias approvals" }
if($pandaBiasScanner -notmatch "ScannerPair") { throw "panda bias scanner should keep the all-pair scanner panel" }
if($pandaBiasScanner -notmatch 'IndicatorShortName\("Panda Bias Scanner v4"\)') { throw "panda bias scanner v4 should use the requested display name" }
if($pandaBiasScanner -notmatch "PANDA BIAS SCANNER V4|BIAS SCANNER V4") { throw "panda bias scanner v4 should use the requested panel title" }
if($pandaBiasScanner -notmatch "Panel_DefaultBottomLeft\s*=\s*false") { throw "panda bias scanner should default below the AutoTrade panel area" }
if($pandaBiasScanner -notmatch "Panel_Width\s*=\s*350") { throw "panda bias scanner should default width to 350" }
if($pandaBiasScanner -notmatch "Panel_FontSize\s*=\s*9") { throw "panda bias scanner should default font size to 9" }
if($pandaBiasScanner -notmatch "OpenChartTimeframe\s*=\s*PERIOD_H1") { throw "panda bias scanner v4 should open clicked pairs on H1" }
if($pandaBiasScanner -notmatch "ScannerRowFromObject") { throw "panda bias scanner v4 should map panel clicks to scanner rows" }
if($pandaBiasScanner -notmatch "ChartOpen") { throw "panda bias scanner v4 should open a pair chart when a row is clicked" }
if($pandaBiasScanner -match "WagBox") { throw "panda bias scanner should use Panda Box wording only" }
if($pandaBiasScannerNoLicense -match "ValidateLicense|LicenseEndpoint|ProductCode|WebRequest") { throw "panda bias scanner v4 no license should not contain license enforcement code" }
if($pandaBiasScannerNoLicense -notmatch 'IndicatorShortName\("Panda Bias Scanner v4 No License"\)') { throw "panda bias scanner v4 no license should use the requested display name" }
if($pandaBiasScannerNoLicense -notmatch "NO LICENSE") { throw "panda bias scanner v4 no license should clearly say no license" }
if($pandaBiasScannerNoLicense -notmatch "OpenChartTimeframe\s*=\s*PERIOD_H1") { throw "panda bias scanner v4 no license should open clicked pairs on H1" }
if($pandaBiasScannerNoLicense -notmatch "ScannerRowFromObject") { throw "panda bias scanner v4 no license should map panel clicks to scanner rows" }
if($pandaBiasScannerNoLicense -notmatch "ChartOpen") { throw "panda bias scanner v4 no license should open a pair chart when a row is clicked" }
if($pandaBiasScannerNoLicense -match "WagBox") { throw "panda bias scanner v4 no license should use Panda Box wording only" }
if($pandaBiasScannerInputNoLicense -match "ValidateLicense|LicenseEndpoint|ProductCode|WebRequest") { throw "panda bias scanner v4 input no license should not contain license enforcement code" }
if($pandaBiasScannerInputNoLicense -notmatch 'IndicatorShortName\("Panda Bias Scanner v4 Input No License"\)') { throw "panda bias scanner v4 input no license should use the requested display name" }
if($pandaBiasScannerInputNoLicense -notmatch "NO LICENSE") { throw "panda bias scanner v4 input no license should clearly say no license" }
if($pandaBiasScannerInputNoLicense -notmatch "input\s+int\s+Panel_Width\s*=\s*350") { throw "panda bias scanner v4 input no license should expose Panel_Width input default 350" }
if($pandaBiasScannerInputNoLicense -notmatch "input\s+int\s+Panel_FontSize\s*=\s*9") { throw "panda bias scanner v4 input no license should expose Panel_FontSize input default 9" }
if($pandaBiasScannerInputNoLicense -notmatch "input\s+int\s+OpenChartTimeframe\s*=\s*PERIOD_H1") { throw "panda bias scanner v4 input no license should expose clicked chart timeframe input default H1" }
if($pandaBiasScannerInputNoLicense -notmatch "ScannerRowFromObject") { throw "panda bias scanner v4 input no license should map panel clicks to scanner rows" }
if($pandaBiasScannerInputNoLicense -notmatch "ChartOpen") { throw "panda bias scanner v4 input no license should open a pair chart when a row is clicked" }
if($pandaBiasScannerInputNoLicense -match "WagBox") { throw "panda bias scanner v4 input no license should use Panda Box wording only" }

$logs = Get-ChildItem -LiteralPath $releaseDir -Filter "*.log"
foreach($log in $logs) {
  $body = Get-Content -LiteralPath $log.FullName -Raw
  if($body -notmatch "Result:\s+0 errors,\s+0 warnings") {
    throw "Compile log is not clean: $($log.FullName)"
  }
}

"Panda v3 indicator checks passed"
