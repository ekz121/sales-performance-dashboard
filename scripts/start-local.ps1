$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$PidFile = Join-Path $ProjectRoot ".dashboard-local.pid"
$PortFile = Join-Path $ProjectRoot ".dashboard-local.port"
$LogDirectory = Join-Path $ProjectRoot "logs"

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
  $ExistingProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $ExistingPid" -ErrorAction SilentlyContinue
  if ($ExistingProcess -and $ExistingProcess.Name -eq "node.exe" -and $ExistingProcess.CommandLine -like "*$ProjectRoot*") {
    $ExistingPort = if (Test-Path -LiteralPath $PortFile) { [int](Get-Content -LiteralPath $PortFile) } else { 3210 }
    Start-Process "http://localhost:$ExistingPort/dashboard"
    exit 0
  }
  Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $PortFile -Force -ErrorAction SilentlyContinue
}

function Test-Port([int]$CandidatePort) {
  $Client = New-Object Net.Sockets.TcpClient
  try {
    $Connection = $Client.BeginConnect("127.0.0.1", $CandidatePort, $null, $null)
    return $Connection.AsyncWaitHandle.WaitOne(500) -and $Client.Connected
  } catch { return $false }
  finally { $Client.Dispose() }
}

function Test-SalesDashboard([int]$CandidatePort) {
  try {
    $Response = Invoke-WebRequest -Uri "http://127.0.0.1:$CandidatePort/api/analytics" -UseBasicParsing -TimeoutSec 5
    return $Response.StatusCode -eq 200 -and $Response.Content -match '"filters"'
  } catch { return $false }
}

$Port = 0
foreach ($CandidatePort in 3210..3219) {
  if (Test-Port $CandidatePort) {
    if (Test-SalesDashboard $CandidatePort) {
      Start-Process "http://localhost:$CandidatePort/dashboard"
      exit 0
    }
    continue
  }
  $Port = $CandidatePort
  break
}
if (-not $Port) { Show-Error "Port 3210 sampai 3219 sedang dipakai aplikasi lain. Tutup aplikasi tersebut lalu coba lagi." }
$Url = "http://localhost:$Port/dashboard"

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
[IO.File]::WriteAllText($PortFile, [string]$Port)

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
  $ErrorLog = Join-Path $LogDirectory "dashboard-error.log"
  $Detail = if (Test-Path -LiteralPath $ErrorLog) {
    (Get-Content -LiteralPath $ErrorLog -Tail 8 -ErrorAction SilentlyContinue) -join "`n"
  } else { "Log error tidak tersedia." }
  Show-Error "Dashboard gagal menyala pada port $Port.`n`n$Detail`n`nFile log: $ErrorLog"
}
Start-Process $Url
