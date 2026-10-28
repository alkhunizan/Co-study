param([string[]]$Items=@('A00','A04','A02','A11','A12','A13'))
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot
$nodePath='C:\Users\alkhu\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\bin\node.exe'
$queueReceipt=Join-Path $taskRoot 'browser-queue.json'
$results=@()
foreach($item in $Items){
    $runtime=Join-Path $taskRoot ('worktrees/'+$item)
    $label=if($item -eq 'A02'){'a02-final2-browser'}else{$item.ToLower()+'-final-browser'}
    $port=@{A00='3665';A04='3664';A02='3662';A11='3666';A12='3667';A13='3668'}[$item]
    if(!$port){throw 'Unknown isolated worktree'}
    $evidence=Join-Path $runtime 'docs/away/2026-10-26/evidence'
    $before=Join-Path $evidence ($label+'-source-before.json')
    $after=Join-Path $evidence ($label+'-source-after.json')
    & $nodePath (Join-Path $PSScriptRoot 'capture-source.cjs') $runtime $before
    $first=Get-Content -LiteralPath $before -Raw | ConvertFrom-Json
    if($first.envFilePresent -or $first.trackedSourceStatus.Count){throw 'Qualification requires clean tracked source and no .env file.'}
    $started=(Get-Date).ToString('o')
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'run-check.ps1') -Runtime $runtime -Label $label -Task 'test:smoke' -Port $port
    $testExit=$LASTEXITCODE
    & $nodePath (Join-Path $PSScriptRoot 'capture-source.cjs') $runtime $after
    $last=Get-Content -LiteralPath $after -Raw | ConvertFrom-Json
    $log=Get-Content -LiteralPath (Join-Path $evidence ($label+'.log')) -Raw
    $counts=@{}
    foreach($kind in @('passed','failed','skipped')){
        $matchesFound=[regex]::Matches($log,'(?m)^\s*(\d+) '+$kind+'(?:\s|$)')
        $counts[$kind]=if($matchesFound.Count){[int]$matchesFound[$matchesFound.Count-1].Groups[1].Value}else{0}
    }
    $same=($first.manifest -eq $last.manifest -and !$first.trackedSourceStatus.Count -and !$last.trackedSourceStatus.Count)
    $results += [pscustomobject]@{item=$item;label=$label;started=$started;finished=(Get-Date).ToString('o');exitCode=$testExit;counts=$counts;sourceStable=$same;manifest=$last.manifest;headBefore=$first.head;headAfter=$last.head}
    $results | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $queueReceipt -Encoding UTF8
    Write-Output ($results[-1] | ConvertTo-Json -Compress -Depth 4)
    if(!$same){throw 'Application or test source changed during browser qualification. Queue stopped.'}
}
if($results | Where-Object exitCode -NE 0){exit 1}
exit 0
