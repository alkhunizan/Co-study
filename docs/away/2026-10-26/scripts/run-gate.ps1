param([Parameter(Mandatory=$true)][string]$Runtime, [string]$Label='final', [string]$Port='3660', [switch]$SkipBrowser)
$ErrorActionPreference='Stop'
$runner=Join-Path $PSScriptRoot 'run-check.ps1'
$tasks=@('check','typecheck','lint','deadcode','audit:prod','test:integration')
if (!$SkipBrowser) { $tasks += 'test:smoke' }
$results=@()
foreach ($task in $tasks) {
    $taskLabel=$Label+'-'+$task.Replace(':','-')
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runner -Runtime $Runtime -Label $taskLabel -Task $task -Port $Port
    $taskExit=$LASTEXITCODE
    $results += [pscustomobject]@{task=$task;exitCode=$taskExit}
}
$results | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Runtime "docs/away/2026-10-26/evidence/$Label-gate.json") -Encoding UTF8
if ($results | Where-Object exitCode -NE 0) { exit 1 }
exit 0
