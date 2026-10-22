param([string]$Label, [string[]]$Command, [string]$Task, [string]$Script, [string]$Runtime, [string]$SmokePort='3511', [switch]$LocalArtifacts, [switch]$JsonReport, [switch]$Install, [switch]$Preview, [switch]$Postgres, [switch]$Online)
$ErrorActionPreference = 'Stop'
$outputRoot = Split-Path $PSScriptRoot
$runtimeRoot = if ($Runtime) { $Runtime } else { Join-Path $env:LOCALAPPDATA 'Temp/halastudy-top20-2026-10-22/candidate' }
$nodePath = Join-Path $env:LOCALAPPDATA 'npm-cache/_npx/52027bd8fc0022aa/node_modules/node/bin/node.exe'
if (!(Test-Path -LiteralPath $nodePath)) { throw 'Verified Node 22 executable not found' }
foreach ($entry in Get-ChildItem Env:) {
    if ($entry.Name -match '^(SUPABASE_|PLATFORM_|CLOUDFLARE_|R2_|DIGETPAY_|OPS_ALERT_|AUTH_MAIL_|GOOGLE_|BILLING_|SESSION_SECRET|HALASTUDY_TEST_DATABASE_URL|NODE_OPTIONS|DATABASE_URL|REDIS_URL)') {
        Remove-Item -LiteralPath ('Env:' + $entry.Name)
    }
}
$env:PATH=(Split-Path $nodePath)+';'+$env:PATH
$toolBin=Join-Path (Split-Path $runtimeRoot) "node22-tools/$PID"
New-Item -ItemType Directory -Force $toolBin | Out-Null
Set-Content -LiteralPath (Join-Path $toolBin 'npm.cmd') -Value ('@"'+$nodePath+'" "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" %*') -Encoding ascii
$env:PATH=$toolBin+';'+$env:PATH
$env:NODE_ENV='test'
$env:PLATFORM_DATA_DIR='memory://'
$env:CO_STUDY_OFFLINE=if ($Online) {'0'} else {'1'}
$env:PLAYWRIGHT_CHANNEL='chrome'
$env:CO_STUDY_SMOKE_PORT=$SmokePort
$env:PLAYWRIGHT_OUTPUT_DIR=Join-Path $outputRoot "evidence/$Label-results"
$env:PLAYWRIGHT_HTML_OUTPUT_DIR=Join-Path $outputRoot "evidence/$Label-report"
$env:REFINEMENT_OUTPUT=$outputRoot
if ($JsonReport) { $env:PLAYWRIGHT_JSON_OUTPUT_FILE=Join-Path $outputRoot "evidence/$Label.json" }
if ($LocalArtifacts) {
    $artifactRoot=Join-Path (Split-Path $runtimeRoot) "artifacts/$Label"
    New-Item -ItemType Directory -Force $artifactRoot | Out-Null
    $env:PLAYWRIGHT_OUTPUT_DIR=Join-Path $artifactRoot 'results'
    $env:PLAYWRIGHT_HTML_OUTPUT_DIR=Join-Path $artifactRoot 'report'
}
if (!$Install -and !$Online -and !$Preview) {
    $preload=(Join-Path $PSScriptRoot 'offline-browser-preload.cjs').Replace('\','/')
    $env:NODE_OPTIONS='--require="'+$preload+'"'
    $env:VIBER_EVIDENCE=if ($LocalArtifacts) { $artifactRoot } else { Join-Path $outputRoot 'evidence' }
}
Set-Location $runtimeRoot
if ($Task) { $Command=@('C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js','run',$Task) }
if ($Script) { $Command=@((Join-Path $PSScriptRoot $Script)) }
$start=Get-Date
$startManifestHash=(Get-FileHash -LiteralPath (Join-Path $outputRoot 'evidence/candidate-source.json') -Algorithm SHA256).Hash.ToLower()
if ($Preview) {
    $env:PLATFORM_PREVIEW_PORT='3510'
    & $nodePath scripts/preview-platform.js
    exit $LASTEXITCODE
}
$log = Join-Path $outputRoot "evidence/$Label.log"
$ErrorActionPreference='Continue'
if ($Install) {
    & $nodePath 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' ci *> $log
} elseif ($Postgres) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-postgres.ps1 *> $log
} else {
    & $nodePath @Command *> $log
}
$result=$LASTEXITCODE
if ($LocalArtifacts) {
    foreach ($name in @('results','report')) {
        $from=Join-Path $artifactRoot $name
        if (Test-Path -LiteralPath $from) {
            # Windows PowerShell 5 Copy-Item can drop valid long browser paths.
            $destination=Join-Path $outputRoot "evidence/$Label-$name"
            & robocopy.exe $from $destination /E /R:1 /W:1 /NFL /NDL /NJH /NJS | Out-Null
            if ($LASTEXITCODE -ge 8) { $result=1; Write-Error "Artifact copy failed: $name" }
        }
    }
    $blocked=Join-Path $artifactRoot 'blocked-browser-hosts.ndjson'
    if (Test-Path -LiteralPath $blocked) { Copy-Item -LiteralPath $blocked -Destination (Join-Path $outputRoot "evidence/$Label-blocked-hosts.ndjson") }
}
[ordered]@{label=$Label;command=if($Install){'npm ci'}elseif($Postgres){'scripts/test-postgres.ps1'}else{$Command -join ' '};exitCode=$result;seconds=[math]::Round(((Get-Date)-$start).TotalSeconds,2);runtime=$runtimeRoot;node=(& $nodePath --version);sourceManifestSha256=$startManifestHash;endManifestSha256=(Get-FileHash -LiteralPath (Join-Path $outputRoot 'evidence/candidate-source.json') -Algorithm SHA256).Hash.ToLower()} | ConvertTo-Json -Compress | Add-Content (Join-Path $outputRoot 'evidence/commands.ndjson') -Encoding utf8
Get-Content -LiteralPath $log -Tail 16
Write-Output "$Label exit=$result"
exit $result

