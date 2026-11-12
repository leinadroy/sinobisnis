<#
  Pasang aplikasi Sinobisnis di Windows Server TANPA IIS, sama seperti di laptop development:
    - web langsung di port 3001 (http://<ip-server>:3001), API di 127.0.0.1:4000
    - profil database: staging (10.10.3.62, default) + production (BISA DITULIS, go-live 2026-11-12)
    - login/user/hak akses dibaca dari database profil yang aktif (staging atau production)
  Dibuat untuk server 10.10.3.23, di mana port 80/443 sudah dipakai Apache XAMPP (tidak disentuh).
  Lihat docs/deploy-windows.md, bagian "Deploy langsung port 3001".

  Jalankan di server, PowerShell SEBAGAI ADMINISTRATOR:
    Set-ExecutionPolicy -Scope Process Bypass
    .\setup-direct.ps1                       # http://10.10.3.23:3001
  Boleh dijalankan ulang; .env yang sudah ada TIDAK ditimpa.
#>
param(
  [string]$AppDir = "C:\apps\sinobisnis",
  [string]$PublicUrl = "",
  [string]$RepoUrl = "https://github.com/leinadroy/sinobisnis.git",
  [string]$Branch = "main",
  [string]$ProdHost = "10.10.3.23",
  [string]$StagingHost = "10.10.3.62",
  [int]$WebPort = 3001
)
$ErrorActionPreference = "Stop"
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Step([string]$t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function Ok([string]$t) { Write-Host "  [OK] $t" -ForegroundColor Green }
function Warn([string]$t) { Write-Host "  [!]  $t" -ForegroundColor Yellow }
function Run([string]$What, [scriptblock]$Cmd) {
  Write-Host "  > $What"
  & $Cmd
  if ($LASTEXITCODE -ne 0) { throw "$What gagal (exit $LASTEXITCODE)." }
}
function Ask([string]$q, [string]$def) {
  $a = Read-Host "  $q [$def]"
  if ([string]::IsNullOrWhiteSpace($a)) { return $def } else { return $a.Trim() }
}
function AskSecret([string]$q) {
  while ($true) {
    $s = Read-Host "  $q" -AsSecureString
    $p = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
    if ($p) { return $p }
    Warn "Tidak boleh kosong."
  }
}
function YesNo([string]$q) { return (Read-Host "  $q (y/n)") -match '^(y|ya|yes)$' }
function Enc([string]$v) { return [Uri]::EscapeDataString($v) }

# ---------------------------------------------------------------- 0. Administrator
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw "Jalankan PowerShell sebagai Administrator." }
if (-not $PublicUrl) {
  $ip = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -like "10.*" -or $_.IPAddress -like "192.168.*" } | ForEach-Object IPAddress) | Select-Object -First 1
  if (-not $ip) { $ip = $ProdHost }
  $PublicUrl = "http://${ip}:$WebPort"
}
$PublicUrl = $PublicUrl.TrimEnd("/")
Write-Host "Aplikasi akan dibuka di $PublicUrl" -ForegroundColor Cyan

# ---------------------------------------------------------------- 1. Prasyarat
Step "1. Cek prasyarat"
$missing = @()
$node = Get-Command node.exe -ErrorAction SilentlyContinue
if ($node) {
  $nv = (& node -v).Trim()
  if ([int]($nv.TrimStart("v").Split(".")[0]) -ge 22) { Ok "Node.js $nv" } else { $missing += "Node.js 22 LTS (sekarang $nv)" }
} else { $missing += "Node.js 22 LTS (https://nodejs.org, installer .msi x64)" }
if (Get-Command git.exe -ErrorAction SilentlyContinue) { Ok "Git" } else { $missing += "Git for Windows" }
if (Get-Command nssm.exe -ErrorAction SilentlyContinue) { Ok "NSSM" } else { $missing += "NSSM (salin nssm.exe win64 ke C:\Windows\System32)" }
$browsers = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe")
$browser = $browsers | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($browser) { Ok "Browser untuk PDF: $browser" } else { $missing += "Google Chrome atau Microsoft Edge (untuk PDF invoice)" }
foreach ($h in @($ProdHost, $StagingHost)) {
  if ((Test-NetConnection $h -Port 3306 -WarningAction SilentlyContinue).TcpTestSucceeded) { Ok "Jaringan ke $h`:3306" }
  else { $missing += "Akses jaringan ke database $h`:3306" }
}
$svcWeb = Get-Service SinobisnisWeb -ErrorAction SilentlyContinue
if (-not $svcWeb -and (Test-NetConnection 127.0.0.1 -Port $WebPort -WarningAction SilentlyContinue).TcpTestSucceeded) {
  $missing += "Port $WebPort sudah dipakai program lain (cek: netstat -ano | findstr :$WebPort)"
}
if (-not (Get-Service SinobisnisAPI -ErrorAction SilentlyContinue) -and (Test-NetConnection 127.0.0.1 -Port 4000 -WarningAction SilentlyContinue).TcpTestSucceeded) {
  $missing += "Port 4000 sudah dipakai program lain (cek: netstat -ano | findstr :4000)"
}
if ($missing.Count) {
  Write-Host ""
  Write-Host "Belum lengkap, pasang/perbaiki dulu lalu jalankan ulang script ini:" -ForegroundColor Red
  $missing | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  exit 1
}
$tz = (Get-TimeZone).Id
if ($tz -eq "SE Asia Standard Time") { Ok "Zona waktu UTC+07:00" }
else { Warn "Zona waktu server '$tz' (bukan UTC+07:00). Service tetap memakai TZ=Asia/Jakarta, jadi tanggal aplikasi benar." }

# ---------------------------------------------------------------- 2. Kode
Step "2. Ambil kode ($Branch)"
if (Test-Path (Join-Path $AppDir ".git")) {
  Run "git pull" { git -C $AppDir pull --ff-only }
} else {
  New-Item -ItemType Directory -Force (Split-Path $AppDir) | Out-Null
  Run "git clone $RepoUrl" { git clone -b $Branch $RepoUrl $AppDir }
}
New-Item -ItemType Directory -Force (Join-Path $AppDir "logs") | Out-Null
Set-Location $AppDir
Ok "Kode di $AppDir ($((git rev-parse --short HEAD).Trim()))"

# ---------------------------------------------------------------- 3. Konfigurasi
Step "3. Konfigurasi (.env) - sama seperti laptop: staging + production (bisa ditulis)"
$rootEnv = Join-Path $AppDir ".env"
$apiEnv = Join-Path $AppDir "apps\api\.env"
$stUser = $null; $stPass = $null; $stDb = $null
if (Test-Path $rootEnv) {
  Ok ".env root sudah ada, tidak diubah."
} else {
  Write-Host "  Production: user dengan hak SELECT/INSERT/UPDATE/DELETE pada 'sinobisnis'."
  Write-Host "  Disarankan user khusus aplikasi (sinobisnis_app, docs langkah 2); laptop memakai gxmysql."
  $prodUser = Ask "User database production" "gxmysql"
  $prodPass = AskSecret "Password $prodUser (production)"
  $stDb = Ask "Nama database staging di $StagingHost" "sinobisnis_staging"
  $stUser = Ask "User database staging" "rootdba"
  $stPass = AskSecret "Password $stUser (staging)"
  $content = @"
# Dibuat oleh setup-direct.ps1 $(Get-Date -Format "yyyy-MM-dd"). Jangan di-commit.
# Production
DB_HOST=$ProdHost
DB_PORT=3306
DB_NAME=sinobisnis
DB_USER=$prodUser
DB_PASS=$prodPass

# Staging (MySQL 8 di $StagingHost)
STAGING_DB_HOST=$StagingHost
STAGING_DB_PORT=3306
STAGING_DB_NAME=$stDb
STAGING_DB_USER=$stUser
STAGING_DB_PASS=$stPass
"@
  [IO.File]::WriteAllText($rootEnv, $content, $utf8)
  Ok ".env root dibuat."
}
if (Test-Path $apiEnv) {
  Ok "apps\api\.env sudah ada, tidak diubah."
} else {
  if (-not $stUser) {
    $stDb = Ask "Nama database staging di $StagingHost" "sinobisnis_staging"
    $stUser = Ask "User database staging" "rootdba"
    $stPass = AskSecret "Password $stUser (staging)"
  }
  $bytes = New-Object byte[] 48
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $jwt = [Convert]::ToBase64String($bytes)
  # Petik tunggal: ${...} tetap tertulis apa adanya (API mengisinya dari .env root).
  $content = @'
# Dibuat oleh setup-direct.ps1. Jangan di-commit.
# DATABASE_URL = staging (dipakai Prisma CLI; npm run user:password memakai --profile)
DATABASE_URL="mysql://__SU__:__SP__@__SH__:3306/__SDB__"

JWT_SECRET="__JWT__"
JWT_EXPIRES_IN="12h"
PORT=4000
WEB_ORIGIN="__URL__"

# Profil database (Developer Menu -> Database), sama seperti laptop tanpa profil "local"
DB_PROFILES=staging,production
DB_ENV_FILE=../../.env
DB_PROFILE_DEFAULT=staging
DB_LABEL_STAGING=Staging (server 10.10.3.62)
DB_URL_STAGING=mysql://${STAGING_DB_USER:url}:${STAGING_DB_PASS:url}@${STAGING_DB_HOST}:${STAGING_DB_PORT}/${STAGING_DB_NAME}
DB_LABEL_PRODUCTION=Production
DB_URL_PRODUCTION=mysql://${DB_USER:url}:${DB_PASS:url}@${DB_HOST}:${DB_PORT}/${DB_NAME}
# Go-live 2026-11-12: production BISA DITULIS (pindah ke profil ini minta konfirmasi)
DB_READONLY_PRODUCTION=0
DB_MENU_SYNC_PRODUCTION=0

# Reminder masih dikirim aplikasi lama; staging juga menyimpan SMTP + penerima ASLI. Jangan kirim dari sini.
REMINDER_SCHEDULER=off
'@
  $content = $content.Replace("__SU__", (Enc $stUser)).Replace("__SP__", (Enc $stPass)).Replace("__SH__", $StagingHost).Replace("__SDB__", $stDb).Replace("__JWT__", $jwt).Replace("__URL__", $PublicUrl)
  [IO.File]::WriteAllText($apiEnv, $content, $utf8)
  Ok "apps\api\.env dibuat (JWT_SECRET baru)."
}

# ---------------------------------------------------------------- 4. Install & build
Step "4. Install & build (1-5 menit)"
foreach ($s in "SinobisnisWeb", "SinobisnisAPI") {
  if (Get-Service $s -ErrorAction SilentlyContinue) { nssm stop $s | Out-Null }
}
$env:npm_config_legacy_peer_deps = "true"   # lockfile dibuat dengan setelan ini
Run "npm run install:all" { npm run install:all }
Run "npm run build" { npm run build }

# ---------------------------------------------------------------- 5. Service
Step "5. Windows Service (NSSM)"
& (Join-Path $AppDir "scripts\deploy\install-services.ps1") -Domain $PublicUrl -WebPort $WebPort -WebHost "0.0.0.0"

# ---------------------------------------------------------------- 6. Firewall
Step "6. Firewall"
$rule = "Sinobisnis $WebPort"
if (-not (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName $rule -Direction Inbound -Protocol TCP -LocalPort $WebPort -Action Allow | Out-Null
}
Ok "Port $WebPort dibuka (API 4000 tetap hanya 127.0.0.1). Apache/XAMPP tidak diubah."

# ---------------------------------------------------------------- Selesai
Step "Selesai"
try { $h = Invoke-RestMethod "http://127.0.0.1:4000/api/health" -TimeoutSec 10; Ok "API: $($h | ConvertTo-Json -Compress)" } catch { Warn "API belum menjawab; cek $AppDir\logs\api.log" }
Write-Host ""
Write-Host "Langkah berikutnya:"
Write-Host "  1. Buka $PublicUrl dari PC lain dan login (profil awal: staging, user 'admin')."
Write-Host "  2. Password user production (bcrypt), bila belum ada:"
Write-Host "       cd $AppDir; npm --prefix apps\api run user:password -- <username> --profile production"
Write-Host "  3. Update versi berikutnya: .\scripts\deploy\update.ps1"
