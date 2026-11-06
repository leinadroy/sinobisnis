<#
  Update aplikasi Sinobisnis di server (lihat docs/deploy-windows.md, langkah 11).
  Jalankan sebagai Administrator dari folder root repo:  .\scripts\deploy\update.ps1
  Bila install/build gagal, kode dikembalikan ke versi sebelumnya, dibangun ulang, dan service dinyalakan lagi.
#>
param([switch]$SkipPull)
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $root

function Run([string]$What, [scriptblock]$Cmd) {
  Write-Host "==> $What"
  & $Cmd
  if ($LASTEXITCODE -ne 0) { throw "$What gagal (exit $LASTEXITCODE)." }
}

$prev = (git rev-parse HEAD).Trim()
if (-not $SkipPull) { Run "git pull" { git pull --ff-only } }
$now = (git rev-parse HEAD).Trim()
Write-Host "Versi: $($prev.Substring(0,7)) -> $($now.Substring(0,7))"

$env:npm_config_legacy_peer_deps = "true"   # lockfile dibuat dengan setelan ini
nssm stop SinobisnisWeb | Out-Null
nssm stop SinobisnisAPI | Out-Null
try {
  Run "npm run install:all" { npm run install:all }
  Run "npm run build" { npm run build }
} catch {
  Write-Warning $_
  if ($prev -ne $now) {
    Write-Warning "Kembali ke versi $($prev.Substring(0,7))..."
    git checkout $prev
    Run "npm run install:all (rollback)" { npm run install:all }
    Run "npm run build (rollback)" { npm run build }
    Write-Warning "Kode sekarang di versi lama (detached HEAD). Setelah masalah diperbaiki: git checkout main; .\scripts\deploy\update.ps1"
  }
}
nssm start SinobisnisAPI | Out-Null
nssm start SinobisnisWeb | Out-Null
Start-Sleep -Seconds 8
try { Invoke-RestMethod "http://127.0.0.1:4000/api/health" -TimeoutSec 10 | Out-Null; Write-Host "API OK" } catch { Write-Warning "API belum menjawab; cek logs\api.log" }
try { $w = Invoke-WebRequest "http://127.0.0.1:3001/login" -UseBasicParsing -TimeoutSec 20; Write-Host "Web OK (HTTP $($w.StatusCode))" } catch { Write-Warning "Web belum menjawab; cek logs\web.log" }
