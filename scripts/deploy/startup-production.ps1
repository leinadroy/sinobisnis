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
if (-not $url -or $url.Contains('${')) { throw 'DB_URL_PRODUCTION must be a complete database URL.' }
try { $db = [Uri]$url } catch { throw 'DB_URL_PRODUCTION is invalid.' }
if ($db.Host -ne '10.10.3.23' -or $db.AbsolutePath.Trim('/') -ne 'sinobisnis') {
  throw 'DB_URL_PRODUCTION must target 10.10.3.23/sinobisnis.'
}
$profileState = Join-Path $root 'apps\api\config\db-profile.json'
if (Test-Path $profileState) {
  $selected = (Get-Content $profileState -Raw | ConvertFrom-Json).active
  if ($selected -ne 'production') { throw "The saved active database profile is $selected. Switch it to production first." }
}

foreach ($name in @('SinobisnisAPI', 'SinobisnisWeb')) {
  if (-not (Get-Service -Name $name -ErrorAction SilentlyContinue)) { throw "Windows service $name is not installed." }
}
foreach ($name in @('SinobisnisAPI', 'SinobisnisWeb')) {
  $service = Get-Service -Name $name
  if ($service.Status -eq 'Running' -and $name -eq 'SinobisnisAPI') {
    Restart-Service -Name $name
  } elseif ($service.Status -ne 'Running') {
    Start-Service -Name $name
  }
  (Get-Service -Name $name).WaitForStatus('Running', [TimeSpan]::FromSeconds(30))
  Write-Host "$name running."
}
$health = Invoke-RestMethod 'http://localhost:4000/api/health' -TimeoutSec 10
if ($health.status -ne 'ok' -or $health.database -ne 'ok') { throw 'API health check failed.' }
$web = Invoke-WebRequest 'http://localhost:3001/login' -UseBasicParsing -TimeoutSec 20
if ($web.StatusCode -ne 200) { throw "Web returned HTTP $($web.StatusCode)." }
Write-Host 'Production database selected (read only). API and web are healthy.'
