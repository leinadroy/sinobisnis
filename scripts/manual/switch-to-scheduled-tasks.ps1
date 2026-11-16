# Switch the manually started Sinobisnis processes to the existing Windows tasks.
# Run in an elevated PowerShell on the VM. Does not touch Tomcat or ports 80/443.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$node = (Get-Command node.exe -ErrorAction Stop).Source

function PortOwners([int]$port) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
}

function HealthyApi {
  try {
    $health = Invoke-RestMethod 'http://localhost:4000/api/health' -TimeoutSec 3
    return $health.status -eq 'ok' -and $health.database -eq 'ok'
  } catch { return $false }
}

function HealthyWeb {
  try {
    return (Invoke-WebRequest 'http://localhost:3001/login' -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200
  } catch { return $false }
}

function Wait-Healthy([scriptblock]$check, [string]$name) {
  for ($i = 0; $i -lt 20; $i++) {
    if (& $check) { return }
    Start-Sleep -Seconds 2
  }
  throw "$name belum sehat setelah 40 detik."
}

$apiEnv = Join-Path $root 'apps\api\.env'
$webEnv = Join-Path $root 'apps\web\.env.local'
if (-not (Test-Path $apiEnv) -or -not (Test-Path $webEnv)) { throw 'File konfigurasi API atau web tidak ditemukan.' }
$settings = @{}
foreach ($line in [IO.File]::ReadAllLines($apiEnv)) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
    $settings[$matches[1]] = $matches[2].Trim('"', "'")
  }
}
if ($settings['DB_PROFILE_DEFAULT'] -ne 'staging' -or $settings['DB_PROFILES'] -ne 'staging') {
  throw 'Profil database VM bukan staging. Tidak ada proses yang dihentikan.'
}
if ($settings['REMINDER_SCHEDULER'] -ne 'off') { throw 'Reminder otomatis harus off.' }
$profileState = Join-Path $root 'apps\api\config\db-profile.json'
if ((Test-Path $profileState) -and ((Get-Content $profileState -Raw | ConvertFrom-Json).active -ne 'staging')) {
  throw 'Profil database aktif yang tersimpan bukan staging.'
}

$tasks = @('SinobisnisAPI', 'SinobisnisWeb')
foreach ($name in $tasks) {
  if (-not (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue)) { throw "Task $name belum ada." }
}
$expected = @{
  4000 = 'dist[\\/]main\.js'
  3001 = 'node_modules[\\/]next[\\/]dist[\\/]bin[\\/]next\s+start\s+-p\s+3001'
}
$owners = @{}
foreach ($port in @(3001, 4000)) {
  $owners[$port] = @(PortOwners $port)
  foreach ($ownerId in $owners[$port]) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerId" -ErrorAction Stop
    if (-not $process -or $process.ExecutablePath -ne $node -or $process.CommandLine -notmatch $expected[$port]) {
      throw "Port $port dipakai aplikasi lain (PID $ownerId). Tidak ada proses yang dihentikan."
    }
  }
}

$switchStarted = $false
try {
  $switchStarted = $true
  foreach ($port in @(3001, 4000)) {
    foreach ($ownerId in $owners[$port]) {
      Stop-Process -Id $ownerId -Force -ErrorAction Stop
      Write-Host "Proses manual port $port dihentikan (PID $ownerId)."
    }
  }
  for ($i = 0; $i -lt 10; $i++) {
    if (@(PortOwners 3001).Count -eq 0 -and @(PortOwners 4000).Count -eq 0) { break }
    Start-Sleep -Seconds 1
  }
  if (@(PortOwners 3001).Count -or @(PortOwners 4000).Count) { throw 'Port 3001 atau 4000 belum kosong.' }

  Start-ScheduledTask -TaskName 'SinobisnisAPI'
  Wait-Healthy { HealthyApi } 'API'
  Start-ScheduledTask -TaskName 'SinobisnisWeb'
  Wait-Healthy { HealthyWeb } 'Web'

  Get-ScheduledTask -TaskName $tasks | Select-Object TaskName, State
  Get-NetTCPConnection -LocalPort 3001,4000 -State Listen | Select-Object LocalAddress, LocalPort, OwningProcess
  Get-Service Tomcat9 | Select-Object Name, Status
  Write-Host 'Checkpoint 4B selesai: API dan web sehat melalui Task Scheduler.'
} catch {
  Write-Warning $_.Exception.Message
  if ($switchStarted) {
    Write-Warning 'Mengembalikan proses manual.'
    foreach ($name in @('SinobisnisWeb', 'SinobisnisAPI')) {
      Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
    $env:NODE_ENV = 'production'
    if (@(PortOwners 4000).Count -eq 0) {
      Start-Process -FilePath $node -ArgumentList 'dist/main.js' -WorkingDirectory (Join-Path $root 'apps\api') -WindowStyle Hidden
    }
    if (@(PortOwners 3001).Count -eq 0) {
      Start-Process -FilePath $node -ArgumentList @('node_modules/next/dist/bin/next', 'start', '-p', '3001', '-H', '0.0.0.0') -WorkingDirectory (Join-Path $root 'apps\web') -WindowStyle Hidden
    }
  }
  throw
}
