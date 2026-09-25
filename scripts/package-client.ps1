$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Downloads = Join-Path $env:USERPROFILE "Downloads"
$PackageName = "Sales-Dashboard-Localhost-Klien"
$StagingRoot = Join-Path ([IO.Path]::GetTempPath()) $PackageName
$ZipPath = Join-Path $Downloads "$PackageName.zip"

try {
  $ResolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  $ResolvedStaging = [IO.Path]::GetFullPath($StagingRoot)
  if (-not $ResolvedStaging.StartsWith($ResolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Folder staging berada di luar TEMP; pembuatan paket dibatalkan."
  }
  if (Test-Path -LiteralPath $ResolvedStaging) {
    Remove-Item -LiteralPath $ResolvedStaging -Recurse -Force
  }
  New-Item -ItemType Directory -Path $ResolvedStaging | Out-Null

  & robocopy $ProjectRoot $ResolvedStaging /E `
    /XD .git node_modules .next logs `
    /XF .env .dashboard-local.pid *.log *.tsbuildinfo
  if ($LASTEXITCODE -ge 8) { throw "Penyalinan paket gagal (robocopy $LASTEXITCODE)." }

  $RequiredFiles = @(
    "data-awal\REPORT M221 AGUSTUS 2026 UPDATE.xlsx",
    "data-awal\MASTER KALIMANTAN 1-6 SEPTEMBER  2026.xlsx",
    "data-awal\REPORT M221 SEPTEMBER 2026 UPDATE.xlsx",
    "INSTALL_DASHBOARD.bat",
    "MULAI-DI-SINI.txt"
  )
  foreach ($RelativePath in $RequiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $ResolvedStaging $RelativePath))) {
      throw "Paket tidak lengkap: $RelativePath tidak ditemukan."
    }
  }

  if (Test-Path -LiteralPath $ZipPath) { Remove-Item -LiteralPath $ZipPath -Force }
  Compress-Archive -LiteralPath $ResolvedStaging -DestinationPath $ZipPath -CompressionLevel Optimal
  Write-Host ""
  Write-Host "PAKET KLIEN BERHASIL DIBUAT:" -ForegroundColor Green
  Write-Host $ZipPath
  Write-Host "Kirim ZIP ini, ekstrak, lalu jalankan INSTALL_DASHBOARD.bat."
} catch {
  Write-Host "GAGAL: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
} finally {
  if (Test-Path -LiteralPath $StagingRoot) {
    Remove-Item -LiteralPath $StagingRoot -Recurse -Force
  }
}
