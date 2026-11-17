# Rebuild only the API for the invoice save fix, preserving the previous build.
# Run elevated on the VM after git pull.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$api = Join-Path $root 'apps\api'
$build = Join-Path $api 'dist'
$backup = Join-Path 'C:\SinobisnisBackups' ('api-build-before-invoice-save-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
if (-not (Test-Path (Join-Path $build 'main.js'))) { throw 'Build API lama tidak ditemukan.' }
if (-not (Get-ScheduledTask -TaskName SinobisnisAPI -ErrorAction SilentlyContinue)) { throw 'Task SinobisnisAPI tidak ditemukan.' }
if ((Get-Service Tomcat9).Status -ne 'Stopped') { throw 'Tomcat9 harus tetap berhenti.' }

$moved = $false
try {
  Stop-ScheduledTask -TaskName SinobisnisAPI -ErrorAction Stop
  for ($i=0; $i -lt 15; $i++) {
    if (-not (Get-NetTCPConnection -State Listen -LocalPort 4000 -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Seconds 1
  }
  if (Get-NetTCPConnection -State Listen -LocalPort 4000 -ErrorAction SilentlyContinue) { throw 'Port API 4000 belum berhenti.' }
  Move-Item -LiteralPath $build -Destination $backup -ErrorAction Stop
  $moved = $true
  Write-Host "Build API lama disimpan: $backup"
  & $npm --prefix $api run build
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $build 'main.js'))) { throw 'Build API baru gagal.' }
  Start-ScheduledTask -TaskName SinobisnisAPI -ErrorAction Stop
  $healthy = $false
  for ($i=0; $i -lt 25; $i++) {
    Start-Sleep -Seconds 2
    try {
      $result = Invoke-RestMethod 'http://localhost:4000/api/health' -TimeoutSec 3
      if ($result.status -eq 'ok' -and $result.database -eq 'ok') { $healthy = $true; break }
    } catch {}
  }
  if (-not $healthy) { throw 'API belum sehat setelah build.' }
  Write-Host 'API sehat dengan perbaikan simpan invoice. Web dan HTTPS tidak diubah.'
} catch {
  $reason = $_.Exception.Message
  Stop-ScheduledTask -TaskName SinobisnisAPI -ErrorAction SilentlyContinue
  if ($moved) {
    $targetPath = [IO.Path]::GetFullPath($build)
    $rootPath = [IO.Path]::GetFullPath($root).TrimEnd('\') + '\'
    if (-not $targetPath.StartsWith($rootPath,[StringComparison]::OrdinalIgnoreCase)) { throw 'Path build di luar repo; rollback manual diperlukan.' }
    if (Test-Path $build) { Remove-Item -LiteralPath $build -Recurse -Force }
    Move-Item -LiteralPath $backup -Destination $build -ErrorAction Stop
  }
  Start-ScheduledTask -TaskName SinobisnisAPI -ErrorAction SilentlyContinue
  throw "Pembaruan API gagal; build lama dipulihkan: $reason"
}
