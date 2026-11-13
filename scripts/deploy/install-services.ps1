<#
  Buat / perbarui Windows Service untuk aplikasi Sinobisnis (lihat docs/deploy-windows.md, langkah 7).
  Jalankan sebagai Administrator dari folder root repo, setelah `npm run install:all` dan `npm run build`:
    .\scripts\deploy\install-services.ps1 -Domain "https://sinobisnis.contoh.com"
  Butuh nssm.exe di PATH.
#>
param(
  [Parameter(Mandatory = $true)][string]$Domain,
  [string]$Node = "C:\Program Files\nodejs\node.exe",
  [int]$ApiPort = 4000,
  [int]$WebPort = 3001,
  [string]$WebBind = "127.0.0.1"
)
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$logs = Join-Path $root "logs"
New-Item -ItemType Directory -Force $logs | Out-Null

if (-not (Get-Command nssm.exe -ErrorAction SilentlyContinue)) { throw "nssm.exe tidak ditemukan di PATH." }
if (-not (Test-Path $Node)) { throw "Node.js tidak ditemukan di $Node (pakai -Node <path>)." }
if (-not (Test-Path (Join-Path $root "apps\api\dist\main.js"))) { throw "Belum di-build: jalankan npm run build dulu." }
if (-not (Test-Path (Join-Path $root "apps\api\.env"))) { throw "apps\api\.env belum dibuat (lihat langkah 5)." }

function Install-SmlService([string]$Name, [string]$Dir, [string[]]$AppArgs, [string[]]$EnvVars, [string]$Log, [string]$DependsOn) {
  if (Get-Service $Name -ErrorAction SilentlyContinue) {
    nssm stop $Name | Out-Null
  } else {
    nssm install $Name $Node | Out-Null
  }
  nssm set $Name Application $Node | Out-Null
  nssm set $Name AppParameters ($AppArgs -join " ") | Out-Null
  nssm set $Name AppDirectory $Dir | Out-Null
  nssm set $Name AppEnvironmentExtra @EnvVars | Out-Null
  nssm set $Name AppStdout $Log | Out-Null
  nssm set $Name AppStderr $Log | Out-Null
  nssm set $Name AppRotateFiles 1 | Out-Null
  nssm set $Name AppRotateOnline 1 | Out-Null
  nssm set $Name AppRotateBytes 10485760 | Out-Null
  nssm set $Name Start SERVICE_AUTO_START | Out-Null
  nssm set $Name AppExit Default Restart | Out-Null
  nssm set $Name AppRestartDelay 5000 | Out-Null
  if ($DependsOn) { nssm set $Name DependOnService $DependsOn | Out-Null }
  nssm start $Name | Out-Null
  Write-Host "Service $Name berjalan ($Dir)."
}

Install-SmlService -Name "SinobisnisAPI" -Dir (Join-Path $root "apps\api") -AppArgs @("dist\main.js") `
  -EnvVars @("NODE_ENV=production", "HOST=localhost", "PORT=$ApiPort", "WEB_ORIGIN=$Domain", "TZ=Asia/Jakarta") `
  -Log (Join-Path $logs "api.log")

$webEnv = @("NODE_ENV=production", "PORT=$WebPort", "API_URL=http://localhost:$ApiPort/api", "PDF_RENDER_ORIGIN=http://localhost:$WebPort", "TZ=Asia/Jakarta")
# Uji coba tanpa HTTPS: cookie login harus boleh lewat http, kalau tidak login selalu gagal.
if ($Domain -like "http://*") { $webEnv += "COOKIE_SECURE=0" }

Install-SmlService -Name "SinobisnisWeb" -Dir (Join-Path $root "apps\web") `
  -AppArgs @("node_modules\next\dist\bin\next", "start", "-p", "$WebPort", "-H", "$WebBind") `
  -EnvVars $webEnv `
  -Log (Join-Path $logs "web.log") -DependsOn "SinobisnisAPI"

Start-Sleep -Seconds 8
try {
  $h = Invoke-RestMethod "http://localhost:$ApiPort/api/health" -TimeoutSec 10
  Write-Host "API health: $($h | ConvertTo-Json -Compress)"
} catch { Write-Warning "API belum menjawab; cek $logs\api.log" }
try {
  $w = Invoke-WebRequest "http://localhost:$WebPort/login" -UseBasicParsing -TimeoutSec 20
  Write-Host "Web: HTTP $($w.StatusCode)"
} catch { Write-Warning "Web belum menjawab; cek $logs\web.log" }
