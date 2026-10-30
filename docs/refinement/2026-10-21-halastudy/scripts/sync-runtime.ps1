param([switch]$Baseline, [string]$Runtime)
$ErrorActionPreference = 'Stop'
$sourceRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$outputRoot = Split-Path $PSScriptRoot
$runtimeRoot = if ($Runtime) { $Runtime } else { Join-Path $env:LOCALAPPDATA 'Temp/halastudy-refinement-2026-10-21/candidate' }
$safe = '//192.168.50.113/E/D-Backup/OS/Claude-Projects/body_doubling_live_cam/workspace/Co-study'
New-Item -ItemType Directory -Force -Path $runtimeRoot,(Join-Path $outputRoot 'evidence'),(Join-Path $outputRoot 'screenshots/before'),(Join-Path $outputRoot 'screenshots/after'),(Join-Path $outputRoot 'audit') | Out-Null
$tracked = & git -c "safe.directory=$safe" -c core.quotepath=false -C $sourceRoot ls-files
if ($LASTEXITCODE -ne 0) { throw 'Cannot inventory tracked source' }
$extra = & git -c "safe.directory=$safe" -c core.quotepath=false -C $sourceRoot ls-files --others --exclude-standard
$files = @($tracked + $extra | Sort-Object -Unique | Where-Object { $_ -match '^(public/|services/|db/|design-system/|scripts/|tests/|images/|audio/|videos/|\.github/)|^[^/]+\.(html|js|ts|json|md|yml|webmanifest)$|^\.gitignore$' -and $_ -notmatch '^docs/' })
$manifest = @()
foreach ($relative in $files) {
    $from = Join-Path $sourceRoot $relative
    if (!(Test-Path -LiteralPath $from -PathType Leaf)) { continue }
    $to = Join-Path $runtimeRoot $relative
    New-Item -ItemType Directory -Force (Split-Path $to) | Out-Null
    Copy-Item -LiteralPath $from -Destination $to
    $manifest += [ordered]@{path=$relative; sha256=(Get-FileHash -LiteralPath $from -Algorithm SHA256).Hash.ToLower()}
}
$head = & git -c "safe.directory=$safe" -C $sourceRoot rev-parse HEAD
$label = if ($Baseline) { 'baseline-source' } else { 'candidate-source' }
$target = Join-Path $outputRoot "evidence/$label.json"
if ($Baseline -and (Test-Path -LiteralPath $target)) { throw 'Baseline already recorded; refusing overwrite' }
[ordered]@{source=$sourceRoot; runtime=$runtimeRoot; head=$head; files=$manifest; envCopied=(Test-Path (Join-Path $runtimeRoot '.env'))} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $target -Encoding utf8
if ($Baseline) {
    & git -c "safe.directory=$safe" -C $sourceRoot status --short | Set-Content (Join-Path $outputRoot 'evidence/baseline-status.txt') -Encoding utf8
    & git -c "safe.directory=$safe" -C $sourceRoot diff --binary | Set-Content (Join-Path $outputRoot 'evidence/baseline-tracked.patch') -Encoding utf8
}
Write-Output "Synchronized $($manifest.Count) files to $runtimeRoot; no environment file copied."
