param(
    [string]$Distribution = 'Claude-SSH',
    [string]$PostgresBin = '/usr/lib/postgresql/16/bin'
)
$ErrorActionPreference = 'Stop'
$taskId = [Guid]::NewGuid().ToString('N')
$taskData = "/tmp/halastudy-hardening-$taskId"
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()
$started = $false
function Invoke-PostgresTool([string]$tool, [string[]]$arguments) {
    & wsl.exe -d $Distribution --cd /tmp --exec "$PostgresBin/$tool" @arguments
    if ($LASTEXITCODE -ne 0) { throw "$tool failed with exit $LASTEXITCODE" }
}
try {
    # Dedicated synthetic cluster, loopback only. No system service or packages.
    Invoke-PostgresTool 'initdb' @('-D', $taskData, '-A', 'trust', '-U', 'hardening')
    Invoke-PostgresTool 'pg_ctl' @('-D', $taskData, '-l', "$taskData/server.log", '-o', "-p $port -h 127.0.0.1 -k $taskData", '-w', 'start')
    $started = $true
    Invoke-PostgresTool 'createdb' @('-h', '127.0.0.1', '-p', "$port", '-U', 'hardening', 'halastudy_hardening_test')
    $env:HALASTUDY_TEST_DATABASE_URL = "postgresql://hardening@127.0.0.1:$port/halastudy_hardening_test"
    & node --test tests/postgres/outages.test.js
    $result = $LASTEXITCODE
} finally {
    Remove-Item Env:HALASTUDY_TEST_DATABASE_URL -ErrorAction SilentlyContinue
    if ($started) { Invoke-PostgresTool 'pg_ctl' @('-D', $taskData, '-m', 'immediate', '-w', 'stop') }
    Write-Output "Synthetic cluster evidence retained at ${Distribution}:$taskData"
}
exit $result
