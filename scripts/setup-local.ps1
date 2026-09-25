$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $ProjectRoot

function Stop-Setup([string]$Message) {
  Write-Host ""
  Write-Host "GAGAL: $Message" -ForegroundColor Red
  Write-Host "Tidak ada data setengah jadi yang sengaja dipertahankan oleh installer." -ForegroundColor Yellow
  Read-Host "Tekan Enter untuk menutup"
  exit 1
}

function Run-Step([string]$Title, [string]$Command, [string[]]$Arguments) {
  Write-Host ""
  Write-Host "== $Title ==" -ForegroundColor Cyan
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Title gagal (kode $LASTEXITCODE)." }
}

try {
  Write-Host "====================================================" -ForegroundColor DarkRed
  Write-Host " SETUP LOKAL SALES PERFORMANCE DASHBOARD" -ForegroundColor White
  Write-Host "====================================================" -ForegroundColor DarkRed

  $Node = Get-Command node.exe -ErrorAction SilentlyContinue
  $Npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $Node -or -not $Npm) {
    Stop-Setup "Node.js LTS belum terpasang. Instal Node.js 20 atau lebih baru dari https://nodejs.org lalu jalankan installer ini lagi."
  }
  $NodeVersion = (& $Node.Source --version).TrimStart("v").Split(".")
  if ([int]$NodeVersion[0] -lt 20) {
    Stop-Setup "Node.js terlalu lama. Versi minimal adalah 20.9."
  }

  $XamppRoot = "C:\xampp"
  $Mysql = Join-Path $XamppRoot "mysql\bin\mysql.exe"
  $MysqlAdmin = Join-Path $XamppRoot "mysql\bin\mysqladmin.exe"
  $MysqlStart = Join-Path $XamppRoot "mysql_start.bat"
  if (-not (Test-Path -LiteralPath $Mysql)) {
    Stop-Setup "MySQL XAMPP tidak ditemukan di C:\xampp. Instal XAMPP pada lokasi standar."
  }

  function Test-MySql {
    $Client = New-Object Net.Sockets.TcpClient
    try {
      $Connection = $Client.BeginConnect("127.0.0.1", 3306, $null, $null)
      return $Connection.AsyncWaitHandle.WaitOne(1000) -and $Client.Connected
    } catch { return $false }
    finally { $Client.Dispose() }
  }

  if (-not (Test-MySql)) {
    Write-Host "Menyalakan MySQL XAMPP..." -ForegroundColor Yellow
    Start-Process -FilePath $MysqlStart -WorkingDirectory $XamppRoot -WindowStyle Hidden
    $Ready = $false
    for ($Attempt = 0; $Attempt -lt 30; $Attempt++) {
      Start-Sleep -Seconds 1
      if (Test-MySql) { $Ready = $true; break }
    }
    if (-not $Ready) { Stop-Setup "MySQL XAMPP tidak berhasil menyala pada port 3306." }
  }

  $RootPassword = ""
  $AppPasswordBytes = New-Object byte[] 24
  $Random = [Security.Cryptography.RandomNumberGenerator]::Create()
  $Random.GetBytes($AppPasswordBytes)
  $AppPassword = ([Convert]::ToBase64String($AppPasswordBytes) -replace '[^A-Za-z0-9]', '').Substring(0, 28)
  $DatabaseName = "erafone_dashboard"
  $Sql = "CREATE DATABASE IF NOT EXISTS $DatabaseName CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER IF NOT EXISTS 'erafone_app'@'127.0.0.1' IDENTIFIED BY '$AppPassword'; ALTER USER 'erafone_app'@'127.0.0.1' IDENTIFIED BY '$AppPassword'; GRANT ALL PRIVILEGES ON $DatabaseName.* TO 'erafone_app'@'127.0.0.1'; FLUSH PRIVILEGES;"

  function Initialize-Database([string]$Password) {
    $Previous = $env:MYSQL_PWD
    try {
      $env:MYSQL_PWD = $Password
      & $Mysql --protocol=tcp --host=127.0.0.1 --port=3306 --user=root --execute=$Sql 2>$null
      return $LASTEXITCODE -eq 0
    } finally {
      $env:MYSQL_PWD = $Previous
    }
  }

  if (-not (Initialize-Database $RootPassword)) {
    $RootPassword = Read-Host "Password root MySQL XAMPP (input tidak ditampilkan)" -AsSecureString
    $Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($RootPassword)
    try { $PlainRootPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer) }
    if (-not (Initialize-Database $PlainRootPassword)) {
      Stop-Setup "Login root MySQL gagal. Periksa password atau port MySQL XAMPP."
    }
  }

  $AdminUser = Read-Host "Username admin dashboard [admin]"
  if ([string]::IsNullOrWhiteSpace($AdminUser)) { $AdminUser = "admin" }
  $AdminPassword = Read-Host "Password admin dashboard [admin123]"
  if ([string]::IsNullOrWhiteSpace($AdminPassword)) { $AdminPassword = "admin123" }
  $AuthBytes = New-Object byte[] 48
  $Random.GetBytes($AuthBytes)
  $Random.Dispose()
  $AuthSecret = [Convert]::ToBase64String($AuthBytes)
  $SafeAdminUser = $AdminUser.Replace("\", "\\").Replace('"', '\"')
  $SafeAdminPassword = $AdminPassword.Replace("\", "\\").Replace('"', '\"')
  $EnvironmentText = @"
DATABASE_URL="mysql://erafone_app:$AppPassword@127.0.0.1:3306/$DatabaseName"
ADMIN_USERNAME="$SafeAdminUser"
ADMIN_PASSWORD="$SafeAdminPassword"
AUTH_SECRET="$AuthSecret"
"@
  [IO.File]::WriteAllText((Join-Path $ProjectRoot ".env"), $EnvironmentText, (New-Object Text.UTF8Encoding($false)))

  $DataDirectory = Join-Path $ProjectRoot "data-awal"
  $RequiredFiles = @(
    "REPORT M221 AGUSTUS 2026 UPDATE.xlsx",
    "MASTER KALIMANTAN 1-6 SEPTEMBER  2026.xlsx",
    "REPORT M221 SEPTEMBER 2026 UPDATE.xlsx"
  )
  foreach ($FileName in $RequiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $DataDirectory $FileName))) {
      Stop-Setup "File data-awal\$FileName tidak ditemukan. Jangan keluarkan file Excel dari folder paket."
    }
  }

  Run-Step "Memasang komponen aplikasi" $Npm.Source @("ci", "--no-audit", "--no-fund")
  Run-Step "Membuat seluruh tabel database" $Npm.Source @("exec", "--", "prisma", "migrate", "deploy")
  Run-Step "Mengimpor semua data Excel" $Node.Source @("--import", "tsx", "scripts/import-initial-data.ts", "data-awal")
  Run-Step "Membangun aplikasi produksi" $Npm.Source @("run", "build")

  $Desktop = [Environment]::GetFolderPath("Desktop")
  $Shell = New-Object -ComObject WScript.Shell
  foreach ($ShortcutInfo in @(
    @{ Name = "Buka Sales Dashboard.lnk"; Target = "BUKA_DASHBOARD.bat"; Description = "Menjalankan Sales Performance Dashboard lokal" },
    @{ Name = "Tutup Sales Dashboard.lnk"; Target = "TUTUP_DASHBOARD.bat"; Description = "Menghentikan Sales Performance Dashboard lokal" }
  )) {
    $Shortcut = $Shell.CreateShortcut((Join-Path $Desktop $ShortcutInfo.Name))
    $Shortcut.TargetPath = Join-Path $ProjectRoot $ShortcutInfo.Target
    $Shortcut.WorkingDirectory = $ProjectRoot
    $Shortcut.Description = $ShortcutInfo.Description
    $Shortcut.Save()
  }

  Write-Host ""
  Write-Host "SETUP SELESAI." -ForegroundColor Green
  Write-Host "Database, tabel, data Excel, build, dan shortcut Desktop sudah siap."
  Write-Host "Login admin: $AdminUser"
  Write-Host "Dashboard akan dibuka sekarang."
  & (Join-Path $PSScriptRoot "start-local.ps1")
  Read-Host "Tekan Enter untuk menutup installer"
} catch {
  Stop-Setup $_.Exception.Message
}
