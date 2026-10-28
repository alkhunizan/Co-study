$ErrorActionPreference='Stop'
$outputRoot=Split-Path $PSScriptRoot
$sourceRoot=(Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$manifestPath=Join-Path $outputRoot 'evidence/candidate-source.json'
$manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding utf8 | ConvertFrom-Json
$runtimes=@($manifest.runtime,(Join-Path $env:LOCALAPPDATA 'Temp/halastudy-refinement-2026-10-21/candidate')) | Sort-Object -Unique
$mismatches=@()
foreach($entry in $manifest.files){
    foreach($directory in @($sourceRoot)+$runtimes){
        $file=Join-Path $directory $entry.path
        if(!(Test-Path -LiteralPath $file) -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLower() -ne $entry.sha256){$mismatches+=@{directory=$directory;path=$entry.path}}
    }
}
$envFiles=@($runtimes | Where-Object {Test-Path -LiteralPath (Join-Path $_ '.env')})
$baseline=Get-Content -LiteralPath (Join-Path $outputRoot 'evidence/baseline-source.json') -Raw -Encoding utf8 | ConvertFrom-Json
$protected=@($baseline.files | Where-Object {$_.path -match '^services/platform/(billing|catalog|database|digetpay)|^services/video/|^db/migrations/|^package(-lock)?\.json$'})
$changedProtected=@($protected | Where-Object {(Get-FileHash -LiteralPath (Join-Path $sourceRoot $_.path) -Algorithm SHA256).Hash.ToLower() -ne $_.sha256})
$result=[ordered]@{files=$manifest.files.Count;source=$sourceRoot;runtimes=$runtimes;manifestSha256=(Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLower();mismatches=$mismatches;envFiles=$envFiles;protectedFiles=$protected.Count;changedProtected=$changedProtected}
$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $outputRoot 'evidence/final-parity.json') -Encoding utf8
Write-Output "$($manifest.files.Count) source files checked across source and $($runtimes.Count) runtimes; mismatches=$($mismatches.Count); environment files=$($envFiles.Count); changed protected files=$($changedProtected.Count)."
if($mismatches.Count -or $envFiles.Count -or $changedProtected.Count){exit 1}
