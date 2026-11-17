# Update this VM from origin/main, reinstall pinned dependencies, rebuild, and restart services.
# Run elevated. Does not send reminder emails during validation.
param([switch]$AfterPull)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

if (-not $AfterPull) {
  if ((& git -C $root branch --show-current).Trim() -ne 'main') { throw 'Checkout VM harus berada di branch main.' }
  if (& git -C $root status --porcelain) { throw 'Ada perubahan lokal di VM; update dihentikan agar tidak tertimpa.' }
  & git -C $root fetch origin main
  if ($LASTEXITCODE -ne 0) { throw 'Git fetch gagal; layanan belum diubah.' }
  & git -C $root merge --ff-only origin/main
  if ($LASTEXITCODE -ne 0) { throw 'Git fast-forward gagal; layanan belum diubah.' }
  # Jalankan versi script yang baru ditarik, bila script ini sendiri ikut berubah.
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -AfterPull
  exit $LASTEXITCODE
}

$revision = (& git -C $root rev-parse --short HEAD).Trim()
$backup = Join-Path 'C:\SinobisnisBackups' ('update-latest-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$marker = 'C:\SinobisnisBackups\sinobisnis-deployed-commit.txt'
$packages = @('packages\shared','apps\api','apps\web')
$tasks = @('SinobisnisAPI','SinobisnisWeb','SinobisnisHTTPS')
$taskName = 'Expired Reminder Sinobisnis'
$bat = Join-Path $PSScriptRoot 'run-reminder-schedule.bat'
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source

if (-not (Test-Path $bat)) { throw 'BAT reminder aplikasi baru tidak ditemukan.' }
if ((Get-Service Tomcat9).Status -ne 'Stopped') { throw 'Tomcat9 masih berjalan; hentikan sebelum pembaruan.' }
if ((Get-PSDrive C).Free -lt 10GB) { throw 'Ruang kosong C: kurang dari 10 GiB; pembaruan dihentikan.' }
foreach ($name in $tasks) {
  if (-not (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue)) { throw "Task layanan tidak ditemukan: $name" }
}
foreach ($package in $packages) {
  if (-not (Test-Path (Join-Path $root "$package\package-lock.json"))) { throw "Lockfile tidak ditemukan: $package" }
}
$assets = @(
  @{ path=(Join-Path $root 'packages\shared\node_modules'); saved=(Join-Path $backup 'shared-modules'); moved=$false },
  @{ path=(Join-Path $root 'apps\api\node_modules'); saved=(Join-Path $backup 'api-modules'); moved=$false },
  @{ path=(Join-Path $root 'apps\web\node_modules'); saved=(Join-Path $backup 'web-modules'); moved=$false },
  @{ path=(Join-Path $root 'packages\shared\dist'); saved=(Join-Path $backup 'shared-dist'); moved=$false },
  @{ path=(Join-Path $root 'apps\api\dist'); saved=(Join-Path $backup 'api-dist'); moved=$false },
  @{ path=(Join-Path $root 'apps\web\.next'); saved=(Join-Path $backup 'web-next'); moved=$false }
)
foreach ($asset in $assets) {
  if (-not (Test-Path $asset.path)) { throw "Folder build/dependensi tidak ditemukan: $($asset.path)" }
}
$oldTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
$oldActions = if ($oldTask) { @($oldTask.Actions) } else { @() }
$wasDisabled = $oldTask -and $oldTask.State -eq 'Disabled'
if ($oldTask -and $oldTask.State -eq 'Running') { throw 'Task reminder sedang berjalan; tunggu selesai.' }

New-Item -ItemType Directory -Path $backup -Force | Out-Null
& icacls.exe $backup /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Tidak dapat membatasi akses folder backup.' }
if ($oldTask) {
  [IO.File]::WriteAllText((Join-Path $backup 'reminder-task.xml'), (Export-ScheduledTask -TaskName $taskName), [Text.UTF8Encoding]::new($false))
}
Write-Host "Commit terbaru: $revision"
Write-Host "Backup layanan: $backup"
$taskChanged = $false
$taskCreated = $false

function Restore-Asset($asset) {
  if (-not $asset.moved) { return }
  $target = [IO.Path]::GetFullPath($asset.path)
  $inside = [IO.Path]::GetFullPath($root).TrimEnd('\') + '\'
  if (-not $target.StartsWith($inside,[StringComparison]::OrdinalIgnoreCase)) {
    throw 'Path rollback di luar repo; pemulihan manual diperlukan.'
  }
  if (Test-Path $target) { Remove-Item -LiteralPath $target -Recurse -Force }
  Move-Item -LiteralPath $asset.saved -Destination $target -ErrorAction Stop
}

try {
  if ($oldTask) { Disable-ScheduledTask -TaskName $taskName -ErrorAction Stop | Out-Null }
  foreach ($name in @('SinobisnisHTTPS','SinobisnisWeb','SinobisnisAPI')) { Stop-ScheduledTask -TaskName $name -ErrorAction Stop }
  for ($i=0; $i -lt 25; $i++) {
    if (-not (Get-NetTCPConnection -State Listen -LocalPort 3001,4000,8443 -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Seconds 1
  }
  if (Get-NetTCPConnection -State Listen -LocalPort 3001,4000,8443 -ErrorAction SilentlyContinue) {
    throw 'Port layanan belum kosong; build tidak diubah.'
  }
  foreach ($asset in $assets) {
    Move-Item -LiteralPath $asset.path -Destination $asset.saved -ErrorAction Stop
    $asset.moved = $true
  }

  foreach ($package in $packages) {
    $folder = Join-Path $root $package
    & $npm --prefix $folder ci --prefer-offline --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm ci gagal: $package" }
    & $npm --prefix $folder run build
    if ($LASTEXITCODE -ne 0) { throw "Build gagal: $package" }
  }
  $requiredNext = (Get-Content (Join-Path $root 'apps\web\package.json') -Raw | ConvertFrom-Json).dependencies.next
  $installedNext = (Get-Content (Join-Path $root 'apps\web\node_modules\next\package.json') -Raw | ConvertFrom-Json).version
  if ($requiredNext -ne $installedNext) { throw "Versi Next.js belum sesuai: $installedNext, perlu $requiredNext" }

  Start-ScheduledTask -TaskName 'SinobisnisAPI' -ErrorAction Stop
  $apiReady = $false
  for ($i=0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    try {
      $health = Invoke-RestMethod 'http://localhost:4000/api/health' -TimeoutSec 3
      if ($health.status -eq 'ok' -and $health.database -eq 'ok') { $apiReady = $true; break }
    } catch {}
  }
  if (-not $apiReady) { throw 'API tidak sehat setelah build.' }
  & $bat --check
  if ($LASTEXITCODE -ne 0) { throw 'GET reminder lokal tanpa login gagal.' }

  Start-ScheduledTask -TaskName 'SinobisnisWeb' -ErrorAction Stop
  Start-ScheduledTask -TaskName 'SinobisnisHTTPS' -ErrorAction Stop
  $httpsReady = $false
  for ($i=0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    if (Get-NetTCPConnection -State Listen -LocalPort 8443 -ErrorAction SilentlyContinue) { $httpsReady = $true; break }
  }
  if (-not $httpsReady) { throw 'HTTPS 8443 belum aktif.' }
  $loginCode = (& curl.exe -sS -o NUL -w '%{http_code}' --max-time 10 --resolve 'smlgroupid.com:8443:127.0.0.1' 'https://smlgroupid.com:8443/login' 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $loginCode -ne '200') { throw "Halaman login HTTPS gagal: $loginCode" }
  $logout = (& curl.exe -sS -o NUL -w '%{redirect_url}' --max-time 10 --resolve 'smlgroupid.com:8443:127.0.0.1' -b 'sml_token=check' -X POST 'https://smlgroupid.com:8443/logout' 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $logout -ne 'https://smlgroupid.com/login') { throw "Redirect logout belum sesuai: $logout" }

  if ($oldTask) {
    $action = New-ScheduledTaskAction -Execute $bat -WorkingDirectory $root
    Set-ScheduledTask -TaskName $taskName -Action $action -ErrorAction Stop | Out-Null
    $taskChanged = $true
    Enable-ScheduledTask -TaskName $taskName -ErrorAction Stop | Out-Null
  } else {
    $action = New-ScheduledTaskAction -Execute $bat -WorkingDirectory $root
    $trigger = New-ScheduledTaskTrigger -Daily -At 7:00AM
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Minutes 35) -MultipleInstances IgnoreNew -StartWhenAvailable
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -ErrorAction Stop | Out-Null
    $taskCreated = $true
  }
  if ((Get-ScheduledTask -TaskName $taskName).Actions[0].Execute -ne $bat) { throw 'Action reminder belum terpasang.' }
  [IO.File]::WriteAllText($marker, (& git -C $root rev-parse HEAD).Trim(), [Text.UTF8Encoding]::new($false))
  Write-Host "Selesai: commit $revision, Next.js $installedNext, API dan web sehat."
  Write-Host 'Reminder dijadwalkan pukul 07:00. Pemeriksaan tidak mengirim email.'
  Write-Host "Logout mengarah ke: $logout"
  Get-ScheduledTaskInfo -TaskName $taskName | Select-Object NextRunTime,LastRunTime,LastTaskResult
} catch {
  $reason = $_.Exception.Message
  if ($taskCreated) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue }
  elseif ($oldTask) {
    if ($taskChanged) { Set-ScheduledTask -TaskName $taskName -Action $oldActions -ErrorAction SilentlyContinue | Out-Null }
    if ($wasDisabled) { Disable-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null }
    else { Enable-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null }
  }
  foreach ($name in @('SinobisnisHTTPS','SinobisnisWeb','SinobisnisAPI')) { Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue }
  for ($i=$assets.Count-1; $i -ge 0; $i--) { Restore-Asset $assets[$i] }
  foreach ($name in $tasks) { Start-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue }
  throw "Pembaruan gagal; build/dependensi lama dipulihkan: $reason"
}
