param(
    [Parameter(Mandatory=$true)][string]$Runtime,
    [Parameter(Mandatory=$true)][string]$Label,
    [string]$Task,
    [string]$TestFile,
    [string]$Filter,
    [string]$Port = '3660',
    [switch]$Install
)
$ErrorActionPreference = 'Stop'
$runtimeRoot = (Resolve-Path -LiteralPath $Runtime).Path
$outputRoot = Join-Path $runtimeRoot 'docs/away/2026-10-26/evidence'
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$nodePath = 'C:\Users\alkhu\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\bin\node.exe'
$npmPath = 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js'
foreach ($entry in Get-ChildItem Env:) {
    if ($entry.Name -match '^(SUPABASE_|PLATFORM_|CLOUDFLARE_|R2_|DIGETPAY_|OPS_ALERT_|AUTH_MAIL_|RESEND_|GOOGLE_|BILLING_|SESSION_SECRET$|HALASTUDY_TEST_DATABASE_URL$|NODE_OPTIONS$|DATABASE_URL$|REDIS_URL$|VIDEO_|ROOM_STATE_|USER_STATE_|ADMIN_|ICE_SERVERS_JSON$|SFU_BASE_URL$|ALLOWED_ORIGINS$|PUBLIC_API_BASE_URL$|PORT$)') {
        Remove-Item -LiteralPath ('Env:' + $entry.Name)
    }
}
$toolBin = Join-Path $outputRoot 'tools'
New-Item -ItemType Directory -Path $toolBin -Force | Out-Null
Set-Content -LiteralPath (Join-Path $toolBin 'npm.cmd') -Encoding ascii -Value ('@"' + $nodePath + '" "' + $npmPath + '" %*')
$env:PATH = $toolBin + ';' + (Split-Path $nodePath) + ';' + $env:PATH
$env:NODE_ENV = 'test'
$env:CI = '1'
$env:PLATFORM_DATA_DIR = 'memory://'
$env:CO_STUDY_OFFLINE = '1'
$env:PLAYWRIGHT_CHANNEL = 'chrome'
$env:CO_STUDY_SMOKE_PORT = $Port
$env:CO_STUDY_SMOKE_ROOM_STATE_FILE = Join-Path $outputRoot ("$Label-temp/smoke.rooms.json")
New-Item -ItemType Directory -Path (Split-Path $env:CO_STUDY_SMOKE_ROOM_STATE_FILE) -Force | Out-Null
$env:PLAYWRIGHT_OUTPUT_DIR = Join-Path $outputRoot "$Label-results"
$env:PLAYWRIGHT_HTML_OUTPUT_DIR = Join-Path $outputRoot "$Label-report"
$env:PLAYWRIGHT_JSON_OUTPUT_FILE = Join-Path $outputRoot "$Label-browser.json"
$env:VIBER_EVIDENCE = $outputRoot
Set-Location -LiteralPath $runtimeRoot
if (-not $Install) {
    $preload = (Join-Path $runtimeRoot 'docs/viber/2026-10-23/scripts/offline-browser-preload.cjs').Replace('\','/')
    $env:NODE_OPTIONS = '--require="' + $preload + '"'
}
$toolArgs = if ($Install) { @($npmPath, 'ci') } else { @($npmPath, 'run', $Task) }
if ($TestFile) {
    if ($TestFile -match 'integration[/\\]') { $toolArgs = @('--test', $TestFile) }
    else {
        $toolArgs = @('node_modules/playwright/cli.js', 'test', $TestFile, '--reporter=list,json')
        if ($Filter) { $toolArgs += @('--grep', $Filter) }
    }
}
$start = Get-Date
$head = git rev-parse HEAD
$log = Join-Path $outputRoot "$Label.log"
$ErrorActionPreference = 'Continue'
& $nodePath @toolArgs *> $log
$result = $LASTEXITCODE
[ordered]@{ label=$Label; command=($toolArgs -join ' '); exitCode=$result; seconds=[math]::Round(((Get-Date)-$start).TotalSeconds,2); runtime=$runtimeRoot; head=$head; node=(& $nodePath --version) } | ConvertTo-Json -Compress | Add-Content -LiteralPath (Join-Path $outputRoot 'commands.ndjson') -Encoding UTF8
Get-Content -LiteralPath $log -Tail 18
Write-Output "$Label exit=$result"
exit $result
