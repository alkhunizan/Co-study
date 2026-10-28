param([string]$Label, [string[]]$Command, [string[]]$Sync = @(),
    [string]$Runtime = (Join-Path $env:LOCALAPPDATA 'Temp\halastudy-hardening-2026-10-21'),
    [switch]$Install, [switch]$Postgres)
$ErrorActionPreference = 'Stop'
$repo = '\\192.168.50.113\E\D-Backup\OS\Claude-Projects\body_doubling_live_cam\workspace\Co-study'
$runtime = $Runtime
$evidence = Join-Path $repo 'docs\hardening\2026-10-21\evidence'
foreach ($file in $Sync) {
    $target = Join-Path $runtime $file
    New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
    Copy-Item -LiteralPath (Join-Path $repo $file) -Destination $target
}
foreach ($entry in Get-ChildItem Env:) {
    if ($entry.Name -match '^(SUPABASE_|PLATFORM_|CLOUDFLARE_|R2_|DIGETPAY_|OPS_ALERT_|AUTH_MAIL_|BILLING_|SESSION_SECRET|HALASTUDY_TEST_DATABASE_URL|NODE_OPTIONS)') {
        Remove-Item -LiteralPath ('Env:' + $entry.Name)
    }
}
$env:NODE_ENV='test'; $env:PLATFORM_DATA_DIR='memory://'; $env:CO_STUDY_OFFLINE='1'
$env:PLAYWRIGHT_CHANNEL='chrome'; $env:CO_STUDY_SMOKE_PORT='3475'
$env:PLAYWRIGHT_OUTPUT_DIR=Join-Path $evidence $Label
$env:PLAYWRIGHT_HTML_OUTPUT_DIR=Join-Path $evidence ($Label+'-report')
$node='C:\Users\alkhu\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\bin\node.exe'
$env:PATH=(Split-Path $node)+';'+$env:PATH
if (!$Install) {
    $preload = (Join-Path $runtime 'docs/hardening/2026-10-21/offline-browser-preload.cjs').Replace('\','/')
    $env:NODE_OPTIONS='--require="'+$preload+'"'
}
$env:VIBER_EVIDENCE=$evidence
Set-Location $runtime
$ErrorActionPreference='Continue'
if ($Postgres) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-postgres.ps1 *> (Join-Path $evidence ($Label+'.txt'))
} else {
    & $node @Command *> (Join-Path $evidence ($Label+'.txt'))
}
$result=$LASTEXITCODE
Write-Output "$Label exit=$result"
exit $result
