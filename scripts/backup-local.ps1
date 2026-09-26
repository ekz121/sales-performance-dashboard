param([switch]$Quiet)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$EnvironmentFile = Join-Path $ProjectRoot ".env"
$BackupDirectory = Join-Path $ProjectRoot "backups"
$Dump = "C:\xampp\mysql\bin\mysqldump.exe"

if (-not (Test-Path -LiteralPath $EnvironmentFile)) { throw "File .env belum tersedia." }
if (-not (Test-Path -LiteralPath $Dump)) { throw "mysqldump XAMPP tidak ditemukan." }

$EnvironmentText = Get-Content -LiteralPath $EnvironmentFile -Raw
$Match = [Regex]::Match($EnvironmentText, 'DATABASE_URL="mysql://([^:]+):([^@]+)@([^:]+):(\d+)/([^"?]+)')
if (-not $Match.Success) { throw "DATABASE_URL lokal tidak dapat dibaca." }
$DatabaseUser = $Match.Groups[1].Value
$DatabasePassword = $Match.Groups[2].Value
$DatabaseHost = $Match.Groups[3].Value
$DatabasePort = $Match.Groups[4].Value
$DatabaseName = $Match.Groups[5].Value

New-Item -ItemType Directory -Path $BackupDirectory -Force | Out-Null
$TodayBackup = Get-ChildItem -LiteralPath $BackupDirectory -File -Filter "$DatabaseName-*.sql" -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime.Date -eq (Get-Date).Date } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if ($TodayBackup) {
  if (-not $Quiet) { Write-Host "Backup hari ini sudah tersedia: $($TodayBackup.Name)" -ForegroundColor Green }
  return
}

$Target = Join-Path $BackupDirectory "$DatabaseName-$(Get-Date -Format 'yyyyMMdd-HHmmss').sql"
$PreviousPassword = $env:MYSQL_PWD
try {
  $env:MYSQL_PWD = $DatabasePassword
  & $Dump --protocol=tcp --host=$DatabaseHost --port=$DatabasePort --user=$DatabaseUser `
    --single-transaction --skip-lock-tables --default-character-set=utf8mb4 `
    --result-file=$Target $DatabaseName
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $Target)) {
    throw "Backup MySQL gagal (kode $LASTEXITCODE)."
  }
} finally {
  $env:MYSQL_PWD = $PreviousPassword
}

$ResolvedRoot = [IO.Path]::GetFullPath($BackupDirectory)
$OldBackups = Get-ChildItem -LiteralPath $BackupDirectory -File -Filter "$DatabaseName-*.sql" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 30
foreach ($Backup in $OldBackups) {
  $ResolvedFile = [IO.Path]::GetFullPath($Backup.FullName)
  if ($ResolvedFile.StartsWith($ResolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $ResolvedFile -Force
  }
}
if (-not $Quiet) { Write-Host "Backup selesai: $Target" -ForegroundColor Green }
