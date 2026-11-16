# Read-only inventory of the services and certificates behind ports 80/443.
# Does not output passwords, private keys, or full service command lines.
$ErrorActionPreference = 'Stop'
Write-Host '=== Port 80/443 ==='
$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in @(80,443) } |
  Sort-Object LocalPort, LocalAddress)
$listeners | Select-Object LocalAddress, LocalPort, OwningProcess | Format-Table -AutoSize

Write-Host '=== Proses pemilik port ==='
foreach ($ownerId in @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerId" -ErrorAction SilentlyContinue
  if ($process) {
    [pscustomobject]@{ PID = $ownerId; Name = $process.Name; ExecutablePath = $process.ExecutablePath } | Format-List
  }
  Get-CimInstance Win32_Service -Filter "ProcessId = $ownerId" -ErrorAction SilentlyContinue |
    Select-Object Name, DisplayName, State, StartMode, ProcessId | Format-Table -AutoSize
}

Write-Host '=== Tomcat ==='
Get-Service Tomcat9 -ErrorAction SilentlyContinue | Select-Object Name, Status, StartType | Format-Table -AutoSize
foreach ($reg in @(
  'HKLM:\SOFTWARE\Apache Software Foundation\Procrun 2.0\Tomcat9\Parameters\Java',
  'HKLM:\SOFTWARE\WOW6432Node\Apache Software Foundation\Procrun 2.0\Tomcat9\Parameters\Java'
)) {
  $java = Get-ItemProperty -LiteralPath $reg -ErrorAction SilentlyContinue
  if ($java) {
    $java.Options | Where-Object { $_ -match 'catalina\.(base|home)' } | ForEach-Object { Write-Host $_ }
  }
}

Write-Host '=== HTTP.sys SSL bindings (hanya metadata) ==='
& netsh.exe http show sslcert

Write-Host '=== Sertifikat di LocalMachine\My (tanpa private key) ==='
Get-ChildItem Cert:\LocalMachine\My -ErrorAction SilentlyContinue |
  Select-Object Subject, NotAfter, Thumbprint, HasPrivateKey | Format-Table -Wrap

Write-Host '=== IIS ==='
Get-Service W3SVC -ErrorAction SilentlyContinue | Select-Object Name, Status, StartType | Format-Table -AutoSize
