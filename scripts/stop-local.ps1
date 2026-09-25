$ProjectRoot = Split-Path -Parent $PSScriptRoot
$PidFile = Join-Path $ProjectRoot ".dashboard-local.pid"
Add-Type -AssemblyName PresentationFramework

if (Test-Path -LiteralPath $PidFile) {
  $DashboardPid = [int](Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue)
  $Process = Get-CimInstance Win32_Process -Filter "ProcessId = $DashboardPid" -ErrorAction SilentlyContinue
  if ($Process -and $Process.Name -eq "node.exe" -and $Process.CommandLine -like "*$ProjectRoot*") {
    Stop-Process -Id $DashboardPid -Force
  }
  Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}
[System.Windows.MessageBox]::Show("Sales Dashboard sudah dihentikan. MySQL XAMPP tetap dibiarkan hidup agar aplikasi lain tidak terganggu.", "Sales Dashboard") | Out-Null
