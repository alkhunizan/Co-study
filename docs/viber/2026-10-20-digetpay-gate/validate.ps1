param([switch]$Resume, [string]$RuntimeRoot)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$evidence = Join-Path $PSScriptRoot 'evidence'
$candidate = if ($RuntimeRoot) { Join-Path $RuntimeRoot 'candidate' } else { Join-Path $evidence 'candidate' }
$gitSafe = 'safe.directory=//192.168.50.113/E/D-Backup/OS/Claude-Projects/body_doubling_live_cam/workspace/Co-study'
New-Item -ItemType Directory -Force -Path $candidate, (Join-Path $evidence 'temp') | Out-Null
$env:TEMP = if ($RuntimeRoot) { Join-Path $RuntimeRoot 'temp' } else { Join-Path $evidence 'temp' }
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
$env:TMP = $env:TEMP
$env:PLATFORM_DATABASE_URL = ''
$env:SUPABASE_URL = ''
$env:SUPABASE_SERVICE_ROLE_KEY = ''
$env:DIGETPAY_API_KEY = ''
$env:OPS_ALERT_WEBHOOK_URL = ''
$env:CLOUDFLARE_REALTIMEKIT_API_TOKEN = ''
$env:AUTH_MAIL_MODE = ''
$env:CO_STUDY_OFFLINE = '1'
$env:PLAYWRIGHT_CHANNEL = 'chrome'
$env:PLAYWRIGHT_OUTPUT_DIR = Join-Path $evidence 'browser-results'
$env:PLAYWRIGHT_HTML_OUTPUT_DIR = Join-Path $evidence 'browser-report'
$env:CO_STUDY_SMOKE_PORT = '3478'

$archive = Join-Path $evidence 'head.zip'
if (!$Resume) {
    git -c $gitSafe -C $repo archive --format=zip --output $archive HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Git archive failed' }
    Expand-Archive -LiteralPath $archive -DestinationPath $candidate
}
Set-Location $candidate
$node22 = 'C:\Users\alkhu\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\bin\node.exe'
$npmCli = 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js'
$env:PATH = (Split-Path $node22) + ';' + $env:PATH
$ErrorActionPreference = 'Continue' # Native stderr is evidence, not a PowerShell terminating error.
& $node22 -v *> (Join-Path $evidence 'node-version.txt')
& $node22 $npmCli ci *> (Join-Path $evidence 'install.txt')
if ($LASTEXITCODE -ne 0) { throw 'Clean install failed; inspect install.txt' }
# HEAD syntax verification precedes overlay of the explicitly inventoried candidate work.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($archive)
foreach ($item in @('services/ops/alerts.js','tests/integration/operational-alerts.integration.test.js')) {
    [IO.Compression.ZipFileExtensions]::ExtractToFile($zip.GetEntry($item), (Join-Path $candidate $item), $true)
}
$zip.Dispose()
& $node22 $npmCli run check *> (Join-Path $evidence 'head-check.txt')
$headCheck = $LASTEXITCODE
$overlays = @(
    '.env.example','README.md','README_AR.md','co-study-server.js','platform.html',
    'public/js/platform.js','scripts/check-platform.js','scripts/preview-platform.js',
    'services/platform/billing.js','services/platform/catalog.js','services/platform/database.js',
    'services/platform/index.js','services/platform/maintenance.js','services/platform/routes.js',
    'services/platform/digetpay-billing.js','services/platform/digetpay-client.js',
    'db/migrations/002-digetpay.sql','tests/helpers/digetpay-fixture.js',
    'tests/integration/digetpay.integration.test.js','tests/smoke/digetpay.smoke.spec.js',
    'services/ops/alerts.js','tests/integration/operational-alerts.integration.test.js',
    'tests/integration/circle-lifecycle.integration.test.js','tests/integration/presence.integration.test.js'
)
$manifest = foreach ($relative in $overlays) {
    Copy-Item -LiteralPath (Join-Path $repo $relative) -Destination (Join-Path $candidate $relative)
    @{ path=$relative; sha256=(Get-FileHash -LiteralPath (Join-Path $candidate $relative)).Hash }
}
@{head='7371761dd726cc0dac2bd70d9a8022f05a311cfe'; headCheck=$headCheck; runtimeDirectory=$candidate; overlays=$manifest} |
    ConvertTo-Json -Depth 5 | Set-Content (Join-Path $evidence 'candidate-manifest.json')
$results = @()
foreach ($name in @('check','typecheck','lint','deadcode','audit:prod','test:integration','test:smoke')) {
    $fileName = $name.Replace(':','-') + '.txt'
    & $node22 $npmCli run $name *> (Join-Path $evidence $fileName)
    $code = $LASTEXITCODE
    $results += @{command="npm run $name"; exitCode=$code; evidence=$fileName}
    $results | ConvertTo-Json | Set-Content (Join-Path $evidence 'commands.json')
    Write-Output "$name exit=$code"
}
