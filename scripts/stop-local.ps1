$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $repoRoot '.local/server.pid'
if (Test-Path -LiteralPath $pidFile) {
    $processId = [int](Get-Content -LiteralPath $pidFile)
    $serverProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$processId"
    if ($serverProcess -and $serverProcess.CommandLine -like '*web/server/index.ts*') { Stop-Process -Id $processId }
    Remove-Item -LiteralPath $pidFile
}
Write-Output 'Local application stopped. PostgreSQL data remains in its named volume.'
