$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location -LiteralPath $repoRoot
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + [Environment]::GetEnvironmentVariable('Path', 'Machine')
$env:PYTHONIOENCODING = 'utf-8'
$logDir = Join-Path $repoRoot '.recordings/rotation'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$logPath = Join-Path $logDir 'scheduler.log'
"$(Get-Date -Format o) Starting RELEASED rotation" | Out-File -FilePath $logPath -Append -Encoding utf8
& npm run songs:rotate -- --device cpu *>> $logPath
exit $LASTEXITCODE
