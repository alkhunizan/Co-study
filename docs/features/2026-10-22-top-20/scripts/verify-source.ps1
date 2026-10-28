$ErrorActionPreference='Stop'
$taskOutput=Split-Path $PSScriptRoot
$taskManifest=Get-Content -LiteralPath (Join-Path $taskOutput 'evidence/candidate-source.json') -Raw -Encoding utf8 | ConvertFrom-Json
$taskMismatch=@()
foreach($entry in $taskManifest.files){
 foreach($directory in @($taskManifest.source,$taskManifest.runtime)){
  $file=Join-Path $directory $entry.path
  if(!(Test-Path -LiteralPath $file) -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLower() -ne $entry.sha256){$taskMismatch+=@{directory=$directory;path=$entry.path}}
 }
}
$taskEnv=Test-Path -LiteralPath (Join-Path $taskManifest.runtime '.env')
$taskResult=[ordered]@{head=$taskManifest.head;files=$taskManifest.files.Count;source=$taskManifest.source;runtime=$taskManifest.runtime;mismatches=$taskMismatch;envCopied=$taskEnv;manifestSha256=(Get-FileHash -LiteralPath (Join-Path $taskOutput 'evidence/candidate-source.json') -Algorithm SHA256).Hash.ToLower()}
$taskResult | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $taskOutput 'evidence/final-source-parity.json') -Encoding utf8
Write-Output "Verified $($taskManifest.files.Count) files; mismatches=$($taskMismatch.Count); envCopied=$taskEnv."
if($taskMismatch.Count -or $taskEnv){exit 1}
