$ErrorActionPreference = "Stop"

$root = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$releaseDir = Join-Path $root "panda-indicators\2026-06-16\v3-release"

$sources = @(
  "scoring v3 input.mq4",
  "scoring v3.mq4",
  "panda full v3 indicator input.mq4",
  "panda full v3 indicator.mq4"
)

$compiled = @(
  "scoring v3 input.ex4",
  "scoring v3.ex4",
  "panda full v3 indicator input.ex4",
  "panda full v3 indicator.ex4"
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

if($scoringInput -notmatch "\binput\b") { throw "scoring v3 input.mq4 should expose inputs" }
if($fullInput -notmatch "\binput\b") { throw "panda full v3 indicator input.mq4 should expose inputs" }
if($scoringPrivate -match "\binput\b") { throw "scoring v3.mq4 should not expose inputs" }
if($fullPrivate -match "\binput\b") { throw "panda full v3 indicator.mq4 should not expose inputs" }

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

$logs = Get-ChildItem -LiteralPath $releaseDir -Filter "*.log"
foreach($log in $logs) {
  $body = Get-Content -LiteralPath $log.FullName -Raw
  if($body -notmatch "Result:\s+0 errors,\s+0 warnings") {
    throw "Compile log is not clean: $($log.FullName)"
  }
}

"Panda v3 indicator checks passed"
