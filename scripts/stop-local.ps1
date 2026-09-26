$ProjectRoot = Split-Path -Parent $PSScriptRoot
$PidFile = Join-Path $ProjectRoot ".dashboard-local.pid"
$PortFile = Join-Path $ProjectRoot ".dashboard-local.port"
Add-Type -AssemblyName PresentationFramework

function Test-OwnDashboardProcess($CandidateProcess) {
  return (
    $CandidateProcess -and
    $CandidateProcess.Name -eq "node.exe" -and
    $CandidateProcess.CommandLine -and
    $CandidateProcess.CommandLine.IndexOf($ProjectRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
    $CandidateProcess.CommandLine -match 'next(\.cmd|\.js)?\s+start|next\\dist\\bin\\next.*\sstart\s'
  )
}

$OwnProcesses = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { Test-OwnDashboardProcess $_ })
foreach ($DashboardProcess in $OwnProcesses) {
  Stop-Process -Id $DashboardProcess.ProcessId -Force -ErrorAction SilentlyContinue
  Wait-Process -Id $DashboardProcess.ProcessId -Timeout 10 -ErrorAction SilentlyContinue
}

Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $PortFile -Force -ErrorAction SilentlyContinue
[System.Windows.MessageBox]::Show("Sales Dashboard dari folder ini sudah dihentikan. MySQL XAMPP tetap hidup agar aplikasi lain tidak terganggu. Setelah kotak ini ditutup, folder dashboard aman dipindahkan atau dihapus.", "Sales Dashboard") | Out-Null
