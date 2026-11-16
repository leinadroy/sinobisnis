# Activate the production database for the Windows API task after the final backup.
# Does not alter Apache, Tomcat, or the web task.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$envFile = Join-Path $root 'apps\api\.env'
$stateFile = Join-Path $root 'apps\api\config\db-profile.json'
$backupDir = Join-Path 'C:\SinobisnisBackups' ('api-production-cutover-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
if (-not (Test-Path $envFile)) { throw 'apps\api\.env tidak ditemukan.' }
if ((Get-Service Tomcat9).Status -ne 'Stopped') { throw 'Tomcat9 harus berhenti sebelum production diaktifkan.' }
$final = @(Get-ChildItem 'C:\SinobisnisBackups\sinobisnis-final-*.sql' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
if (-not $final -or $final[0].Length -lt 1GB -or -not (Test-Path ($final[0].FullName + '.sha256'))) {
  throw 'Backup final database beserta checksum tidak ditemukan.'
}
if (-not (Get-ScheduledTask -TaskName SinobisnisAPI -ErrorAction SilentlyContinue)) { throw 'Task SinobisnisAPI tidak ditemukan.' }
$lines = [IO.File]::ReadAllLines($envFile)
$cfg = @{}
foreach ($line in $lines) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
    $cfg[$matches[1]] = $matches[2].Trim('"', "'")
  }
}
if ($cfg['DB_PROFILE_DEFAULT'] -ne 'staging' -or $cfg['DB_PROFILES'] -ne 'staging,production') {
  throw 'Profil awal tidak sesuai dengan checkpoint staging; file tidak diubah.'
}
if ($cfg['DB_READONLY_PRODUCTION'] -ne '1' -or $cfg['REMINDER_SCHEDULER'] -ne 'off') {
  throw 'Profil production awal atau scheduler tidak sesuai; file tidak diubah.'
}
$url = $cfg['DB_URL_PRODUCTION']
try { $parsed = [Uri]$url } catch { throw 'DB_URL_PRODUCTION tidak valid.' }
if ($parsed.Scheme -ne 'mysql' -or $parsed.Host -ne '10.10.3.23' -or $parsed.AbsolutePath.Trim('/') -ne 'sinobisnis') {
  throw 'DB_URL_PRODUCTION tidak mengarah ke database production yang diharapkan.'
}
$oldState = if (Test-Path $stateFile) { [IO.File]::ReadAllText($stateFile) } else { $null }
if ($oldState -and (ConvertFrom-Json $oldState).active -ne 'staging') {
  throw 'Profil aktif tersimpan bukan staging; file tidak diubah.'
}

$updates = [ordered]@{
  DATABASE_URL = '"' + $url + '"'
  DB_PROFILES = 'production'
  DB_PROFILE_DEFAULT = 'production'
  DB_READONLY_PRODUCTION = '0'
  DB_AUTH_PRODUCTION = 'production'
  DB_WRITE_USERS_PRODUCTION = '0'
  DB_MENU_SYNC_PRODUCTION = '0'
  REMINDER_SCHEDULER = 'off'
}
$output = [Collections.Generic.List[string]]::new()
$seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($line in $lines) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=') {
    $key = $matches[1]
    if ($updates.Contains($key)) {
      if ($seen.Add($key)) { $output.Add("$key=$($updates[$key])") }
      continue
    }
  }
  $output.Add($line)
}
foreach ($key in $updates.Keys) {
  if ($seen.Add($key)) { $output.Add("$key=$($updates[$key])") }
}

New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
& icacls.exe $backupDir /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Tidak dapat membatasi akses folder backup konfigurasi.' }
Copy-Item -LiteralPath $envFile -Destination (Join-Path $backupDir 'api.env')
if ($oldState) { Copy-Item -LiteralPath $stateFile -Destination (Join-Path $backupDir 'db-profile.json') }
Write-Host "Backup konfigurasi API: $backupDir"

$changed = $false
try {
  Stop-ScheduledTask -TaskName SinobisnisAPI -ErrorAction Stop
  Start-Sleep -Seconds 3
  $changed = $true
  [IO.File]::WriteAllLines($envFile, $output, [Text.UTF8Encoding]::new($false))
  $newState = @{ active='production'; at=(Get-Date).ToString('o'); by='manual-cutover'; from='staging' } | ConvertTo-Json
  [IO.File]::WriteAllText($stateFile, $newState, [Text.UTF8Encoding]::new($false))
  Start-ScheduledTask -TaskName SinobisnisAPI -ErrorAction Stop
  $healthy = $false
  for ($i = 0; $i -lt 25; $i++) {
    Start-Sleep -Seconds 2
    try {
      $health = Invoke-RestMethod 'http://localhost:4000/api/health' -TimeoutSec 3
      if ($health.status -eq 'ok' -and $health.database -eq 'ok') { $healthy = $true; break }
    } catch {}
  }
  if (-not $healthy) { throw 'API production tidak sehat setelah 50 detik.' }
  Write-Host 'API sehat dan profil production aktif dengan write diizinkan.'
  Write-Host 'Reminder scheduler tetap off. Apache belum dialihkan.'
} catch {
  $reason = $_.Exception.Message
  if ($changed) {
    Stop-ScheduledTask -TaskName SinobisnisAPI -ErrorAction SilentlyContinue
    Copy-Item -LiteralPath (Join-Path $backupDir 'api.env') -Destination $envFile -Force
    if ($oldState) { Copy-Item -LiteralPath (Join-Path $backupDir 'db-profile.json') -Destination $stateFile -Force }
    else { Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue }
  }
  Start-ScheduledTask -TaskName SinobisnisAPI -ErrorAction SilentlyContinue
  throw "Aktivasi production gagal; konfigurasi awal dipulihkan: $reason"
}
