$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$envFile = Join-Path $root 'apps\api\.env'
if (-not (Test-Path $envFile)) { throw "Missing $envFile" }

$settings = @{}
foreach ($line in [IO.File]::ReadAllLines($envFile)) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
    $settings[$matches[1]] = $matches[2].Trim('"', "'")
  }
}
if (($settings['DB_PROFILES'] -split '\s*,\s*') -notcontains 'production') { throw 'DB_PROFILES must include production.' }
if ($settings['DB_PROFILE_DEFAULT'] -ne 'production') { throw 'DB_PROFILE_DEFAULT must be production.' }
if ($settings['DB_READONLY_PRODUCTION'] -ne '1') { throw 'DB_READONLY_PRODUCTION must be 1 while the old Tomcat app is active.' }
if ($settings['DB_MENU_SYNC_PRODUCTION'] -ne '0') { throw 'DB_MENU_SYNC_PRODUCTION must be 0.' }
if ($settings['REMINDER_SCHEDULER'] -ne 'off') { throw 'REMINDER_SCHEDULER must be off while the old Tomcat app is active.' }

$url = $settings['DB_URL_PRODUCTION']
if (-not $url) { throw 'DB_URL_PRODUCTION is missing.' }
if ($url.Contains('${')) {
  $extraFile = Join-Path (Join-Path $root 'apps\api') $settings['DB_ENV_FILE']
  if (-not (Test-Path $extraFile)) { throw 'DB_ENV_FILE is missing.' }
  $extra = @{}
  foreach ($line in [IO.File]::ReadAllLines($extraFile)) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
      $extra[$matches[1]] = $matches[2].Trim('"', "'")
    }
  }
  $url = [regex]::Replace($url, '\$\{([A-Za-z_][A-Za-z0-9_]*)(:url)?\}', {
    param($match)
    $key = $match.Groups[1].Value
    if (-not $extra.ContainsKey($key)) { throw "Missing $key in DB_ENV_FILE." }
    if ($match.Groups[2].Success) { return [Uri]::EscapeDataString($extra[$key]) }
    return $extra[$key]
  })
}
try { $db = [Uri]$url } catch { throw 'DB_URL_PRODUCTION is invalid.' }
if ($db.Host -ne '10.10.3.23' -or $db.AbsolutePath.Trim('/') -ne 'sinobisnis') {
  throw 'DB_URL_PRODUCTION must target 10.10.3.23/sinobisnis.'
}
$profileState = Join-Path $root 'apps\api\config\db-profile.json'
if (Test-Path $profileState) {
  $selected = (Get-Content $profileState -Raw | ConvertFrom-Json).active
  if ($selected -ne 'production') { throw "The saved active database profile is $selected. Switch it to production first." }
}

$services = @('SinobisnisAPI', 'SinobisnisWeb') | ForEach-Object { Get-Service -Name $_ -ErrorAction SilentlyContinue }
function Get-PortOwner([int]$port) {
  $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
  return @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
}
function Assert-LocalOwner([int]$port, [string]$expected, [string]$nodePath) {
  foreach ($pidOnPort in @(Get-PortOwner $port)) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $pidOnPort" -ErrorAction Stop
    if (-not $process -or $process.ExecutablePath -ne $nodePath -or $process.CommandLine -notmatch $expected) {
      throw "Port $port is occupied by another application (PID $pidOnPort). Nothing was stopped."
    }
  }
}
if ($services.Count -eq 2) {
  foreach ($name in @('SinobisnisWeb', 'SinobisnisAPI')) {
    if ((Get-Service -Name $name).Status -eq 'Running') {
      Stop-Service -Name $name
      (Get-Service -Name $name).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30))
    }
  }
  foreach ($name in @('SinobisnisAPI', 'SinobisnisWeb')) {
    Start-Service -Name $name
    (Get-Service -Name $name).WaitForStatus('Running', [TimeSpan]::FromSeconds(30))
    Write-Host "$name restarted."
  }
} elseif ($services.Count -eq 0) {
  $node = (Get-Command node.exe -ErrorAction Stop).Source
  $apiSignature = '(^|[\\/\s])dist[\\/]main\.js(?:\s|$)'
  $webSignature = 'node_modules[\\/]next[\\/]dist[\\/]bin[\\/]next\s+start\s+-p\s+3001\s+-H\s+localhost(?:\s|$)'
  Assert-LocalOwner 4000 $apiSignature $node
  Assert-LocalOwner 3001 $webSignature $node
  foreach ($port in @(3001, 4000)) {
    foreach ($pidOnPort in @(Get-PortOwner $port)) {
      Stop-Process -Id $pidOnPort -Force -ErrorAction Stop
      Write-Host "Stopped previous Sinobisnis process on port $port (PID $pidOnPort)."
    }
  }
  for ($attempt = 0; $attempt -lt 10; $attempt++) {
    if (@(Get-PortOwner 3001).Count -eq 0 -and @(Get-PortOwner 4000).Count -eq 0) { break }
    Start-Sleep -Seconds 1
  }
  if (@(Get-PortOwner 3001).Count -gt 0 -or @(Get-PortOwner 4000).Count -gt 0) {
    throw 'Port 3001 or 4000 is still in use after stopping the old Sinobisnis processes.'
  }
  $logs = Join-Path $root 'logs'
  New-Item -ItemType Directory -Force $logs | Out-Null
  $env:NODE_ENV = 'production'
  $env:DB_PROFILE_DEFAULT = 'production'
  Start-Process -FilePath $node -ArgumentList 'dist/main.js' -WorkingDirectory (Join-Path $root 'apps\api') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'api-startup.out.log') -RedirectStandardError (Join-Path $logs 'api-startup.err.log') | Out-Null
  Start-Process -FilePath $node -ArgumentList @('node_modules/next/dist/bin/next', 'start', '-p', '3001', '-H', 'localhost') -WorkingDirectory (Join-Path $root 'apps\web') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'web-startup.out.log') -RedirectStandardError (Join-Path $logs 'web-startup.err.log') | Out-Null
  Write-Host 'API and web restarted as local processes on ports 4000 and 3001.'
} else {
  throw 'Only one Sinobisnis Windows service is installed; repair service installation first.'
}
$health = $null
for ($attempt = 0; $attempt -lt 12; $attempt++) {
  try {
    $health = Invoke-RestMethod 'http://localhost:4000/api/health' -TimeoutSec 5
    if ($health.status -eq 'ok' -and $health.database -eq 'ok') { break }
  } catch { }
  Start-Sleep -Seconds 3
}
if ($health.status -ne 'ok' -or $health.database -ne 'ok') { throw 'API health check failed.' }
$web = $null
for ($attempt = 0; $attempt -lt 12; $attempt++) {
  try {
    $web = Invoke-WebRequest 'http://localhost:3001/login' -UseBasicParsing -TimeoutSec 5
    if ($web.StatusCode -eq 200) { break }
  } catch { }
  Start-Sleep -Seconds 3
}
if ($web.StatusCode -ne 200) { throw "Web returned HTTP $($web.StatusCode)." }
Write-Host 'Production database selected (read only). API and web are healthy.'
