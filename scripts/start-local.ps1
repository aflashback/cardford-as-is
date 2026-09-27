$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeDirectory = Join-Path $repoRoot '.local'
New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
$pidFile = Join-Path $runtimeDirectory 'server.pid'
if (Test-Path -LiteralPath $pidFile) {
    $existingId = [int](Get-Content -LiteralPath $pidFile)
    $existing = Get-CimInstance Win32_Process -Filter "ProcessId=$existingId"
    if ($existing -and $existing.CommandLine -like '*web/server/index.ts*') {
        Write-Output 'Tricks Coach is already running at http://127.0.0.1:4173'
        exit 0
    }
}
$process = Start-Process -FilePath (Get-Command node).Source -ArgumentList 'web/server/index.ts' -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDirectory 'server.out.log') -RedirectStandardError (Join-Path $runtimeDirectory 'server.err.log') -PassThru
$process.Id | Set-Content -LiteralPath $pidFile
Write-Output 'Tricks Coach starting at http://127.0.0.1:4173. Local logs are in .local.'
