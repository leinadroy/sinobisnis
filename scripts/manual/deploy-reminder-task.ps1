# Deploy API reminder trigger and pending web fixes, then redirect the existing 07:00 task.
# Does not send email during deployment. Run elevated on the VM after git pull.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$api = Join-Path $root 'apps\api'
$web = Join-Path $root 'apps\web'
$apiBuild = Join-Path $api 'dist'
$webBuild = Join-Path $web '.next'
$bat = Join-Path $PSScriptRoot 'run-reminder-schedule.bat'
$backup = Join-Path 'C:\SinobisnisBackups' ('reminder-task-cutover-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$taskName = 'Expired Reminder Sinobisnis'
$serviceTasks = @('SinobisnisAPI','SinobisnisWeb','SinobisnisHTTPS')
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source

foreach ($file in @((Join-Path $apiBuild 'main.js'),(Join-Path $webBuild 'BUILD_ID'),$bat)) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Berkas tidak ditemukan: $file" }
}
$apiEnv = Join-Path $api '.env'
if (-not (Test-Path $apiEnv)) { throw 'Konfigurasi API tidak ditemukan.' }
$apiText = [IO.File]::ReadAllText($apiEnv)
if ($apiText -notmatch '(?m)^DB_PROFILES=production\s*$' -or $apiText -notmatch '(?m)^REMINDER_SCHEDULER=off\s*$') {
  throw 'API harus memakai production dan penjadwal internal harus off.'
}
if ((Get-Service Tomcat9).Status -ne 'Stopped') { throw 'Tomcat9 masih berjalan; task lama bisa mengirim duplikat.' }
foreach ($name in $serviceTasks) {
  if (-not (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue)) { throw "Task layanan tidak ditemukan: $name" }
}
$oldTask = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
$oldActions = @($oldTask.Actions)
if ($oldActions.Count -ne 1 -or $oldActions[0].Execute -notlike '*sinobisnis-schedule-20240823.bat*') {
  throw 'Action task lama tidak sesuai dengan BAT yang diperiksa; task tidak diubah.'
}
$wasDisabled = $oldTask.State -eq 'Disabled'
$dailyAtSeven = @($oldTask.Triggers | Where-Object {
  $_.CimClass.CimClassName -eq 'MSFT_TaskDailyTrigger' -and ([datetime]$_.StartBoundary).Hour -eq 7
})
if (-not $dailyAtSeven.Count) { throw 'Task lama tidak memiliki trigger harian pukul 07:00; tidak diubah.' }
if ($oldTask.State -eq 'Running') { throw 'Task reminder lama sedang berjalan; tunggu selesai.' }

New-Item -ItemType Directory -Path $backup -Force | Out-Null
& icacls.exe $backup /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Tidak dapat membatasi akses backup.' }
[IO.File]::WriteAllText((Join-Path $backup 'old-reminder-task.xml'), (Export-ScheduledTask -TaskName $taskName), [Text.UTF8Encoding]::new($false))
Write-Host "Backup task dan build lama: $backup"

$taskChanged = $false
$apiMoved = $false
$webMoved = $false
function Restore-Build([string]$target, [string]$saved, [bool]$moved) {
  if (-not $moved) { return }
  $targetPath = [IO.Path]::GetFullPath($target)
  $rootPath = [IO.Path]::GetFullPath($root).TrimEnd('\') + '\'
  if (-not $targetPath.StartsWith($rootPath,[StringComparison]::OrdinalIgnoreCase)) {
    throw 'Path rollback di luar repo; pemulihan manual diperlukan.'
  }
  if (Test-Path $target) { Remove-Item -LiteralPath $target -Recurse -Force }
  Move-Item -LiteralPath $saved -Destination $target -ErrorAction Stop
}
try {
  Disable-ScheduledTask -TaskName $taskName -ErrorAction Stop | Out-Null
  foreach ($name in @('SinobisnisHTTPS','SinobisnisWeb','SinobisnisAPI')) {
    Stop-ScheduledTask -TaskName $name -ErrorAction Stop
  }
  for ($i=0; $i -lt 20; $i++) {
    if (-not (Get-NetTCPConnection -State Listen -LocalPort 3001,4000,8443 -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Seconds 1
  }
  if (Get-NetTCPConnection -State Listen -LocalPort 3001,4000,8443 -ErrorAction SilentlyContinue) {
    throw 'Port 3001/4000/8443 belum berhenti; build belum diubah.'
  }
  Move-Item -LiteralPath $apiBuild -Destination (Join-Path $backup 'api-dist') -ErrorAction Stop
  $apiMoved = $true
  Move-Item -LiteralPath $webBuild -Destination (Join-Path $backup 'web-next') -ErrorAction Stop
  $webMoved = $true

  & $npm --prefix $api run build
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $apiBuild 'main.js'))) { throw 'Build API gagal.' }
  & $npm --prefix $web run build
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $webBuild 'BUILD_ID'))) { throw 'Build web gagal.' }

  Start-ScheduledTask -TaskName 'SinobisnisAPI' -ErrorAction Stop
  $apiReady = $false
  for ($i=0; $i -lt 25; $i++) {
    Start-Sleep -Seconds 2
    try {
      $health = Invoke-RestMethod 'http://localhost:4000/api/health' -TimeoutSec 3
      if ($health.status -eq 'ok' -and $health.database -eq 'ok') { $apiReady = $true; break }
    } catch {}
  }
  if (-not $apiReady) { throw 'API tidak sehat setelah build.' }
  & $bat --check
  if ($LASTEXITCODE -ne 0) { throw 'URL GET reminder tanpa login belum siap.' }

  Start-ScheduledTask -TaskName 'SinobisnisWeb' -ErrorAction Stop
  Start-ScheduledTask -TaskName 'SinobisnisHTTPS' -ErrorAction Stop
  $httpsReady = $false
  for ($i=0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    if (Get-NetTCPConnection -State Listen -LocalPort 8443 -ErrorAction SilentlyContinue) { $httpsReady = $true; break }
  }
  if (-not $httpsReady) { throw 'HTTPS 8443 belum aktif setelah build.' }
  $location = (& curl.exe -sS -o NUL -w '%{redirect_url}' --max-time 10 --resolve 'smlgroupid.com:8443:127.0.0.1' -b 'sml_token=check' -X POST 'https://smlgroupid.com:8443/logout' 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $location -ne 'https://smlgroupid.com/login') { throw "Redirect logout belum sesuai: $location" }

  $newAction = New-ScheduledTaskAction -Execute $bat -WorkingDirectory $root
  Set-ScheduledTask -TaskName $taskName -Action $newAction -ErrorAction Stop | Out-Null
  $taskChanged = $true
  Enable-ScheduledTask -TaskName $taskName -ErrorAction Stop | Out-Null
  $installed = Get-ScheduledTask -TaskName $taskName
  if ($installed.Actions[0].Execute -ne $bat -or $installed.State -eq 'Disabled') { throw 'Action task belum terpasang.' }
  Write-Host "Task 07:00 diarahkan ke: $bat"
  Write-Host 'GET lokal tanpa login siap. Tidak ada email dikirim selama deployment.'
  Write-Host "Logout mengarah ke: $location"
  Get-ScheduledTaskInfo -TaskName $taskName | Select-Object NextRunTime,LastRunTime,LastTaskResult
} catch {
  $reason = $_.Exception.Message
  if ($taskChanged) { Set-ScheduledTask -TaskName $taskName -Action $oldActions -ErrorAction SilentlyContinue | Out-Null }
  if ($wasDisabled) { Disable-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null }
  else { Enable-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null }
  foreach ($name in @('SinobisnisHTTPS','SinobisnisWeb','SinobisnisAPI')) { Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue }
  Restore-Build $apiBuild (Join-Path $backup 'api-dist') $apiMoved
  Restore-Build $webBuild (Join-Path $backup 'web-next') $webMoved
  foreach ($name in @('SinobisnisAPI','SinobisnisWeb','SinobisnisHTTPS')) { Start-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue }
  throw "Deployment dibatalkan; build/task lama dipulihkan: $reason"
}
