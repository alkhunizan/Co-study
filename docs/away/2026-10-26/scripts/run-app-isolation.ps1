param([string[]]$Items=@('A00','A04','A02','A11'))
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot
$nodePath='C:\Users\alkhu\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\bin\node.exe'
$receipt=Join-Path $taskRoot 'app-isolation.json'
$results=@()
function Get-Counts([string]$LogPath){
    $log=Get-Content -LiteralPath $LogPath -Raw
    $counts=[ordered]@{}
    foreach($kind in @('passed','failed','skipped','did not run')){
        $found=[regex]::Matches($log,'(?m)^\s*(\d+) '+$kind+'(?:\s|$)')
        $key=if($kind -eq 'did not run'){'notRun'}else{$kind}
        $counts[$key]=if($found.Count){[int]$found[$found.Count-1].Groups[1].Value}else{0}
    }
    return [pscustomobject]$counts
}
foreach($item in $Items){
    $runtime=Join-Path $taskRoot ('worktrees/'+$item)
    $label=$item.ToLower()+'-app-isolated'
    $port=@{A00='3665';A04='3664';A02='3662';A11='3666';A12='3667';A13='3668'}[$item]
    if(!$port){throw 'Unknown isolated worktree'}
    $evidence=Join-Path $runtime 'docs/away/2026-10-26/evidence'
    $before=Join-Path $evidence ($label+'-source-before.json')
    $after=Join-Path $evidence ($label+'-source-after.json')
    & $nodePath (Join-Path $PSScriptRoot 'capture-source.cjs') $runtime $before
    $first=Get-Content -LiteralPath $before -Raw | ConvertFrom-Json
    if($first.envFilePresent -or $first.trackedSourceStatus.Count){throw 'Isolation requires clean tracked source and no .env file.'}
    $started=(Get-Date).ToString('o')
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'run-check.ps1') -Runtime $runtime -Label $label -TestFile 'tests/smoke/app.smoke.spec.js' -Port $port
    $appExit=$LASTEXITCODE
    $appCounts=Get-Counts (Join-Path $evidence ($label+'.log'))
    $remaining=$null
    if($appCounts.notRun -eq 4){
        $remainingLabel=$item.ToLower()+'-app-unexecuted'
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'run-check.ps1') -Runtime $runtime -Label $remainingLabel -TestFile 'tests/smoke/app.smoke.spec.js' -Filter 'scheduled rooms expose|schedule helpers recalculate|large-mode rooms use|five participants can join' -Port $port
        $remainingExit=$LASTEXITCODE
        $remaining=[pscustomobject]@{label=$remainingLabel;exitCode=$remainingExit;counts=(Get-Counts (Join-Path $evidence ($remainingLabel+'.log')))}
    }
    & $nodePath (Join-Path $PSScriptRoot 'capture-source.cjs') $runtime $after
    $last=Get-Content -LiteralPath $after -Raw | ConvertFrom-Json
    $same=($first.manifest -eq $last.manifest -and !$first.trackedSourceStatus.Count -and !$last.trackedSourceStatus.Count)
    $results += [pscustomobject]@{item=$item;label=$label;started=$started;finished=(Get-Date).ToString('o');exitCode=$appExit;counts=$appCounts;remaining=$remaining;sourceStable=$same;manifest=$last.manifest;headBefore=$first.head;headAfter=$last.head}
    $results | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath $receipt -Encoding UTF8
    Write-Output ($results[-1] | ConvertTo-Json -Compress -Depth 6)
    if(!$same){throw 'Application or test source changed during isolation. Queue stopped.'}
}
if($results | Where-Object exitCode -NE 0){exit 1}
exit 0
