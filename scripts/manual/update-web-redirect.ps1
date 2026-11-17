# Rebuild the web after the canonical redirect fix, preserving the previous build for rollback.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$web = Join-Path $root 'apps\web'
$build = Join-Path $web '.next'
$backup = Join-Path 'C:\SinobisnisBackups' ('web-build-before-redirect-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$tasks = @('SinobisnisHTTPS','SinobisnisWeb')
if (-not (Test-Path (Join-Path $build 'BUILD_ID'))) { throw 'Build web awal tidak ditemukan.' }
foreach ($name in $tasks) {
  if (-not (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue)) { throw "Task $name tidak ditemukan." }
}
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$moved = $false
$newBuild = $false
try {
  foreach ($name in $tasks) { Stop-ScheduledTask -TaskName $name -ErrorAction Stop }
  for ($i=0; $i -lt 15; $i++) {
    if (-not (Get-NetTCPConnection -State Listen -LocalPort 3001,8443 -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Seconds 1
  }
  if (Get-NetTCPConnection -State Listen -LocalPort 3001,8443 -ErrorAction SilentlyContinue) {
    throw 'Port web belum berhenti; build tidak diubah.'
  }
  Move-Item -LiteralPath $build -Destination $backup -ErrorAction Stop
  $moved = $true
  Write-Host "Build lama disimpan: $backup"
  & $npm --prefix $web run build
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $build 'BUILD_ID'))) { throw 'Build web baru gagal.' }
  $newBuild = $true
  foreach ($name in $tasks) { Start-ScheduledTask -TaskName $name -ErrorAction Stop }
  $ready = $false
  for ($i=0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    if (Get-NetTCPConnection -State Listen -LocalPort 8443 -ErrorAction SilentlyContinue) { $ready = $true; break }
  }
  if (-not $ready) { throw 'HTTPS 8443 belum aktif setelah build.' }
  $location = (& curl.exe -sS -o NUL -w '%{redirect_url}' --max-time 10 --resolve 'smlgroupid.com:8443:127.0.0.1' -b 'sml_token=check' -X POST 'https://smlgroupid.com:8443/logout' 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $location -ne 'https://smlgroupid.com/login') {
    throw "Redirect logout belum sesuai: $location"
  }
  Write-Host "Logout mengarah ke: $location"
  Write-Host 'Web 3001 dan HTTPS 8443 aktif dengan build baru.'
} catch {
  $reason = $_.Exception.Message
  foreach ($name in $tasks) { Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue }
  if ($moved) {
    $expected = [IO.Path]::GetFullPath((Join-Path $root 'apps\web\.next'))
    if ([IO.Path]::GetFullPath($build) -ne $expected) { throw 'Path build tidak sesuai; rollback manual diperlukan.' }
    if (Test-Path $build) { Remove-Item -LiteralPath $build -Recurse -Force }
    Move-Item -LiteralPath $backup -Destination $build -ErrorAction Stop
  }
  foreach ($name in $tasks) { Start-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue }
  throw "Pembaruan web gagal; build lama dipulihkan: $reason"
}
