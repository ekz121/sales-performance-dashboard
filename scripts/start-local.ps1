$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$PidFile = Join-Path $ProjectRoot ".dashboard-local.pid"
$LogDirectory = Join-Path $ProjectRoot "logs"
$Port = 3210
$Url = "http://localhost:$Port/dashboard"

Add-Type -AssemblyName PresentationFramework
function Show-Error([string]$Message) {
  [System.Windows.MessageBox]::Show($Message, "Sales Dashboard", "OK", "Error") | Out-Null
  exit 1
}

if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot ".env")) -or -not (Test-Path -LiteralPath (Join-Path $ProjectRoot ".next"))) {
  Show-Error "Dashboard belum disiapkan. Jalankan INSTALL_DASHBOARD.bat terlebih dahulu."
}

# Muat konfigurasi lokal secara eksplisit dan timpa environment lama yang
# mungkin masih tersimpan pada terminal/Windows dari deployment cloud.
foreach ($Line in Get-Content -LiteralPath (Join-Path $ProjectRoot ".env")) {
  if ($Line -match '^\s*([^#][^=]*)=(.*)$') {
    $Name = $Matches[1].Trim()
    $Value = $Matches[2].Trim()
    if ($Value.Length -ge 2 -and (($Value.StartsWith('"') -and $Value.EndsWith('"')) -or ($Value.StartsWith("'") -and $Value.EndsWith("'")))) {
      $Value = $Value.Substring(1, $Value.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($Name, $Value, "Process")
  }
}
[Environment]::SetEnvironmentVariable("NODE_ENV", "production", "Process")

$MysqlStart = "C:\xampp\mysql_start.bat"
if (-not (Test-Path -LiteralPath $MysqlStart)) { Show-Error "MySQL XAMPP tidak ditemukan di C:\xampp." }
function Test-MySql {
  $Client = New-Object Net.Sockets.TcpClient
  try {
    $Connection = $Client.BeginConnect("127.0.0.1", 3306, $null, $null)
    return $Connection.AsyncWaitHandle.WaitOne(1000) -and $Client.Connected
  } catch { return $false }
  finally { $Client.Dispose() }
}
if (-not (Test-MySql)) {
  Start-Process -FilePath $MysqlStart -WorkingDirectory "C:\xampp" -WindowStyle Hidden
  $Ready = $false
  for ($Attempt = 0; $Attempt -lt 30; $Attempt++) {
    Start-Sleep -Seconds 1
    if (Test-MySql) { $Ready = $true; break }
  }
  if (-not $Ready) { Show-Error "MySQL XAMPP gagal menyala. Buka XAMPP Control Panel dan periksa MySQL." }
}

if (Test-Path -LiteralPath $PidFile) {
  $ExistingPid = [int](Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue)
  if ($ExistingPid -and (Get-Process -Id $ExistingPid -ErrorAction SilentlyContinue)) {
    Start-Process $Url
    exit 0
  }
  Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}

New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
$Node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $Node) { Show-Error "Node.js tidak ditemukan. Jalankan INSTALL_DASHBOARD.bat kembali." }
$Next = Join-Path $ProjectRoot "node_modules\next\dist\bin\next"
if (-not (Test-Path -LiteralPath $Next)) { Show-Error "Komponen Next.js belum ada. Jalankan INSTALL_DASHBOARD.bat kembali." }

$Process = Start-Process -FilePath $Node `
  -ArgumentList @($Next, "start", "-H", "127.0.0.1", "-p", [string]$Port) `
  -WorkingDirectory $ProjectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $LogDirectory "dashboard-output.log") `
  -RedirectStandardError (Join-Path $LogDirectory "dashboard-error.log") `
  -PassThru
[IO.File]::WriteAllText($PidFile, [string]$Process.Id)

$Online = $false
for ($Attempt = 0; $Attempt -lt 45; $Attempt++) {
  Start-Sleep -Seconds 1
  if ($Process.HasExited) { break }
  try {
    $Response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
    if ($Response.StatusCode -eq 200) { $Online = $true; break }
  } catch { }
}
if (-not $Online) {
  Show-Error "Dashboard gagal menyala. Lihat logs\dashboard-error.log atau jalankan installer lagi."
}
Start-Process $Url
