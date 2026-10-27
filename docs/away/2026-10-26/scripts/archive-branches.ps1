param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot
$repository=Join-Path $taskRoot 'repository'
$target=[IO.Path]::GetFullPath($Destination)
if(!$target.Replace('\','/').EndsWith('/Co-study/docs/away/2026-10-26/handoff')){throw 'Unexpected handoff destination'}
$base='c4d6c50553f55704b4d4a788db28b05fa983047a'
$items=@('A00','A01','A02','A03','A04','A11','A12','A13')
$refs=@()
$records=@()
New-Item -ItemType Directory -Path $target -Force | Out-Null
$patches=Join-Path $target 'patches'
New-Item -ItemType Directory -Path $patches -Force | Out-Null
foreach($item in $items){
    $runtime=if($item -eq 'A01'){$repository}else{Join-Path $taskRoot ('worktrees/'+$item)}
    $dirty=git -C $runtime status --porcelain --untracked-files=normal
    if($LASTEXITCODE -ne 0 -or $dirty){throw ('Uncommitted owned paths remain in '+$item)}
    $branch='refs/heads/away/2026-10-26-1834-'+$item
    $head=(git -C $repository rev-parse $branch).Trim()
    $source=(git -C $runtime log -1 --format=%H -- 'public/js' 'tests').Trim()
    $patch=Join-Path $patches ($item+'.patch')
    git -C $repository -c core.longpaths=true diff --binary --output=$patch ($base+'..'+$branch)
    if($LASTEXITCODE -ne 0){throw ('Patch generation failed for '+$item)}
    $refs += $branch
    $records += [pscustomobject]@{item=$item;branch=$branch;tip=$head;applicationAndTests=$source;runtime=$runtime;patch=('patches/'+$item+'.patch');patchSha256=(Get-FileHash -LiteralPath $patch -Algorithm SHA256).Hash.ToLower()}
}
$bundle=Join-Path $target 'away-work.bundle'
$bundleArgs=@('-C',$repository,'-c','core.longpaths=true','bundle','create',$bundle)+$refs+@('--not',$base)
& git @bundleArgs
if($LASTEXITCODE -ne 0){throw 'Incremental bundle creation failed'}
$priorPreference=$ErrorActionPreference
try {
    $ErrorActionPreference='Continue'
    $verification=git -C $repository bundle verify $bundle 2>&1
    $verifyExit=$LASTEXITCODE
} finally { $ErrorActionPreference=$priorPreference }
$verification | Set-Content -LiteralPath (Join-Path $target 'bundle-verification.txt') -Encoding UTF8
if($verifyExit -ne 0){throw 'Incremental bundle verification failed'}
$heads=git -C $repository bundle list-heads $bundle
$heads | Set-Content -LiteralPath (Join-Path $target 'bundle-heads.txt') -Encoding UTF8
[ordered]@{createdAt=(Get-Date).ToString('o');basePrerequisite=$base;bundle='away-work.bundle';bundleSha256=(Get-FileHash -LiteralPath $bundle -Algorithm SHA256).Hash.ToLower();bundleBytes=(Get-Item -LiteralPath $bundle).Length;verified=$true;branches=$records} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $target 'branches.json') -Encoding UTF8
Write-Output ('Verified incremental bundle and '+$records.Count+' patches in '+$target)
