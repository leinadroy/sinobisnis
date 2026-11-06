<#
  Pasang aplikasi Sinobisnis di Windows Server untuk Fase A (uji coba, production HANYA BACA).
  Lihat docs/deploy-windows.md. Script ini menjalankan langkah 1-9 panduan itu dalam satu kali jalan:
    1. cek prasyarat (Node 22, Git, NSSM, Chrome/Edge, Python+pymysql, MariaDB lokal, jaringan ke production)
    2. ambil kode dari GitHub ke C:\apps\sinobisnis (atau git pull bila sudah ada)
    3. buat .env root dan apps\api\.env (password ditanya, JWT_SECRET dibuat baru) - file yang sudah ada TIDAK ditimpa
    4. salin production -> MariaDB lokal server (login & hak akses), production hanya dibaca
    5. npm install + build
    6. Windows Service SinobisnisAPI + SinobisnisWeb (NSSM)
    7. site IIS + firewall

  Jalankan di server, PowerShell SEBAGAI ADMINISTRATOR:
    Set-ExecutionPolicy -Scope Process Bypass
    .\setup-server.ps1                                  # uji coba lewat http://10.10.3.61
    .\setup-server.ps1 -Domain https://sinobisnis.x.com # dengan domain + sertifikat (binding https diatur manual)
  Boleh dijalankan ulang; langkah yang sudah beres dilewati.
#>
param(
  [string]$AppDir = "C:\apps\sinobisnis",
  [string]$Domain = "http://10.10.3.61",
  [string]$RepoUrl = "https://github.com/leinadroy/sinobisnis.git",
  [string]$Branch = "main",
  [string]$ProdHost = "10.10.3.23",
  [switch]$SkipClone,
  [switch]$SkipIis
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
$Domain = $Domain.TrimEnd("/")
$isHttp = $Domain -like "http://*"

# ---------------------------------------------------------------- 1. Prasyarat
Step "1. Cek prasyarat"
$missing = @()
$node = Get-Command node.exe -ErrorAction SilentlyContinue
if ($node) {
  $nv = (& node -v).Trim()
  if ([int]($nv.TrimStart("v").Split(".")[0]) -ge 22) { Ok "Node.js $nv" } else { $missing += "Node.js 22 LTS (sekarang $nv)" }
} else { $missing += "Node.js 22 LTS (https://nodejs.org, installer .msi x64)" }
if (Get-Command git.exe -ErrorAction SilentlyContinue) { Ok "Git" } else { $missing += "Git for Windows" }
if (Get-Command nssm.exe -ErrorAction SilentlyContinue) { Ok "NSSM" } else { $missing += "NSSM (salin nssm.exe ke C:\Windows\System32)" }
$browsers = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe")
$browser = $browsers | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($browser) { Ok "Browser untuk PDF: $browser" } else { $missing += "Google Chrome atau Microsoft Edge (untuk PDF invoice)" }
if (-not $SkipClone) {
  $py = Get-Command python.exe -ErrorAction SilentlyContinue
  if ($py) {
    & python -c "import pymysql" 2>$null
    if ($LASTEXITCODE -eq 0) { Ok "Python + pymysql" } else { $missing += "pymysql untuk Python (pip install pymysql)" }
  } else { $missing += "Python 3 + pymysql (untuk menyalin data production; atau pakai -SkipClone)" }
}
if ((Test-NetConnection 127.0.0.1 -Port 3306 -WarningAction SilentlyContinue).TcpTestSucceeded) { Ok "MariaDB lokal di port 3306" }
else { $missing += "MariaDB 10.4+ lokal di port 3306 (database login, docs langkah 3)" }
if ((Test-NetConnection $ProdHost -Port 3306 -WarningAction SilentlyContinue).TcpTestSucceeded) { Ok "Jaringan ke production $ProdHost`:3306" }
else { $missing += "Akses jaringan ke production $ProdHost`:3306 (LAN/VPN)" }
if ($missing.Count) {
  Write-Host ""
  Write-Host "Belum lengkap, pasang dulu lalu jalankan ulang script ini:" -ForegroundColor Red
  $missing | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  exit 1
}
$tz = (Get-TimeZone).Id
if ($tz -eq "SE Asia Standard Time") { Ok "Zona waktu UTC+07:00" }
elseif (YesNo "Zona waktu sekarang '$tz'. Ganti ke (UTC+07:00) Jakarta? Dibutuhkan untuk tanggal 'hari ini'") {
  Set-TimeZone -Id "SE Asia Standard Time"; Ok "Zona waktu diganti ke UTC+07:00"
} else { Warn "Zona waktu tidak diganti; tanggal invoice/reminder bisa meleset." }

# ---------------------------------------------------------------- 2. Kode
Step "2. Ambil kode"
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
Step "3. Konfigurasi (.env)"
$rootEnv = Join-Path $AppDir ".env"
$apiEnv = Join-Path $AppDir "apps\api\.env"
$localUser = $null; $localPass = $null
if (Test-Path $rootEnv) {
  Ok ".env root sudah ada, tidak diubah."
} else {
  Write-Host "  Production dibaca dengan user khusus baca (GRANT SELECT saja). Jangan pakai gxmysql."
  $prodUser = Ask "User database production (hanya baca)" "sinobisnis_ro"
  $prodPass = AskSecret "Password $prodUser"
  $localUser = Ask "User MariaDB lokal server (hak penuh pada database sinobisnis)" "sinobisnis_local"
  $localPass = AskSecret "Password $localUser"
  $content = @"
# Dibuat oleh setup-server.ps1 $(Get-Date -Format "yyyy-MM-dd"). Jangan di-commit.
# Production (HANYA BACA) - dipakai tools/db.py dan profil production API
DB_HOST=$ProdHost
DB_PORT=3306
DB_NAME=sinobisnis
DB_USER=$prodUser
DB_PASS=$prodPass

# MariaDB lokal server (login, user, hak akses selama Fase A)
LOCAL_DB_HOST=127.0.0.1
LOCAL_DB_PORT=3306
LOCAL_DB_NAME=sinobisnis
LOCAL_DB_USER=$localUser
LOCAL_DB_PASS=$localPass
"@
  [IO.File]::WriteAllText($rootEnv, $content, $utf8)
  Ok ".env root dibuat."
}
if (Test-Path $apiEnv) {
  Ok "apps\api\.env sudah ada, tidak diubah."
} else {
  if (-not $localUser) {
    $localUser = Ask "User MariaDB lokal server" "sinobisnis_local"
    $localPass = AskSecret "Password $localUser"
  }
  $bytes = New-Object byte[] 48
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $jwt = [Convert]::ToBase64String($bytes)
  # Petik tunggal: ${...} harus tetap tertulis apa adanya (diisi API dari .env root, password tidak ditulis dua kali).
  $content = @'
# Dibuat oleh setup-server.ps1. Jangan di-commit.
# Database login lokal (Prisma CLI & npm run user:password juga memakai ini)
DATABASE_URL="mysql://__LU__:__LP__@localhost:3306/sinobisnis"

JWT_SECRET="__JWT__"
JWT_EXPIRES_IN="12h"
PORT=4000
WEB_ORIGIN="__DOMAIN__"

# Profil database (Developer Menu -> Database)
DB_PROFILES=local,production
DB_ENV_FILE=../../.env
DB_LABEL_LOCAL=Lokal server
DB_URL_LOCAL=${DATABASE_URL}
DB_LABEL_PRODUCTION=Production (hanya baca)
DB_URL_PRODUCTION=mysql://${DB_USER:url}:${DB_PASS:url}@${DB_HOST}:${DB_PORT}/${DB_NAME}
# JANGAN diubah ke 0 kecuali hari go-live yang sudah disepakati (docs langkah 12)
DB_READONLY_PRODUCTION=1
DB_AUTH_PRODUCTION=local
DB_MENU_SYNC_PRODUCTION=0
DB_PROFILE_DEFAULT=production

# Reminder masih dikirim aplikasi lama selama Fase A
REMINDER_SCHEDULER=off
'@
  $content = $content.Replace("__LU__", (Enc $localUser)).Replace("__LP__", (Enc $localPass)).Replace("__JWT__", $jwt).Replace("__DOMAIN__", $Domain)
  [IO.File]::WriteAllText($apiEnv, $content, $utf8)
  Ok "apps\api\.env dibuat (JWT_SECRET baru)."
}

# ---------------------------------------------------------------- 4. Data login lokal
Step "4. Salin production ke MariaDB lokal (production hanya dibaca)"
if ($SkipClone) { Warn "Dilewati (-SkipClone)." }
elseif (YesNo "Salin struktur + data production ke database lokal 'sinobisnis' sekarang? Isi database lokal itu DIGANTI") {
  Run "clone_production.py all --replace (termasuk verifikasi jumlah baris)" { python tools\migrate\clone_production.py all --replace }
} else { Warn "Dilewati. Database lokal harus sudah berisi tabel users/role/menuitem." }

# ---------------------------------------------------------------- 5. Install & build
Step "5. Install & build (1-5 menit)"
foreach ($s in "SinobisnisWeb", "SinobisnisAPI") {
  if (Get-Service $s -ErrorAction SilentlyContinue) { nssm stop $s | Out-Null }
}
$env:npm_config_legacy_peer_deps = "true"   # lockfile dibuat dengan setelan ini
Run "npm run install:all" { npm run install:all }
Run "npm run build" { npm run build }

# ---------------------------------------------------------------- 6. Service
Step "6. Windows Service (NSSM)"
& (Join-Path $AppDir "scripts\deploy\install-services.ps1") -Domain $Domain

# ---------------------------------------------------------------- 7. IIS + firewall
Step "7. IIS"
if ($SkipIis) { Warn "Dilewati (-SkipIis)." }
else {
  $inetsrv = Join-Path $env:windir "system32\inetsrv"
  $hasIis = Test-Path (Join-Path $inetsrv "appcmd.exe")
  $hasRewrite = Test-Path (Join-Path $inetsrv "rewrite.dll")
  $hasArr = Test-Path (Join-Path $env:ProgramFiles "IIS\Application Request Routing")
  if (-not ($hasIis -and $hasRewrite -and $hasArr)) {
    Warn "IIS / URL Rewrite / ARR belum lengkap (IIS=$hasIis, Rewrite=$hasRewrite, ARR=$hasArr)."
    Warn "Pasang lalu jalankan ulang script ini. Sementara itu aplikasi sudah jalan di http://127.0.0.1:3001 (hanya dari server ini)."
  } else {
    $appcmd = Join-Path $inetsrv "appcmd.exe"
    & $appcmd set config -section:system.webServer/proxy /enabled:"True" /preserveHostHeader:"True" /timeout:"00:05:00" /commit:apphost | Out-Null
    & $appcmd set config -section:system.webServer/rewrite/allowedServerVariables /+"[name='HTTP_X_FORWARDED_PROTO']" /commit:apphost 2>$null | Out-Null
    Import-Module WebAdministration
    $siteDir = if ($isHttp) { Join-Path $AppDir "scripts\deploy\iis-http" } else { Join-Path $AppDir "scripts\deploy\iis" }
    $site = Get-Website -Name "Sinobisnis" -ErrorAction SilentlyContinue
    if ($site) {
      Set-ItemProperty "IIS:\Sites\Sinobisnis" -Name physicalPath -Value $siteDir
      Ok "Site IIS 'Sinobisnis' diperbarui ($siteDir)."
    } else {
      $busy = Get-WebBinding -Port 80 | Where-Object { $_.ItemXPath -notmatch "Sinobisnis" }
      if ($busy) {
        $hostName = ([Uri]$Domain).Host
        Warn "Port 80 sudah dipakai site lain ($($busy.ItemXPath)). Site 'Sinobisnis' dibuat dengan binding host '$hostName'."
        New-Website -Name "Sinobisnis" -Port 80 -HostHeader $hostName -PhysicalPath $siteDir | Out-Null
      } else {
        New-Website -Name "Sinobisnis" -Port 80 -PhysicalPath $siteDir | Out-Null
      }
      Ok "Site IIS 'Sinobisnis' dibuat (http port 80)."
    }
    if (-not $isHttp) { Warn "Tambahkan binding https 443 + sertifikat domain di IIS Manager (docs langkah 8)." }
    $port = if ($isHttp) { 80 } else { 443 }
    if (-not (Get-NetFirewallRule -DisplayName "Sinobisnis $port" -ErrorAction SilentlyContinue)) {
      New-NetFirewallRule -DisplayName "Sinobisnis $port" -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow | Out-Null
    }
    Ok "Firewall: port $port dibuka (3001/4000 tetap tertutup, hanya 127.0.0.1)."
  }
}

# ---------------------------------------------------------------- Selesai
Step "Selesai"
try { $h = Invoke-RestMethod "http://127.0.0.1:4000/api/health" -TimeoutSec 10; Ok "API: $($h | ConvertTo-Json -Compress)" } catch { Warn "API belum menjawab; cek $AppDir\logs\api.log" }
Write-Host ""
Write-Host "Langkah berikutnya:"
Write-Host "  1. Beri password (bcrypt) untuk user yang akan uji coba:"
Write-Host "       cd $AppDir; npm --prefix apps\api run user:password -- <username>"
Write-Host "  2. Buka $Domain dari PC lain, login, cek pita 'Production - hanya baca' di atas."
Write-Host "  3. Update versi berikutnya: .\scripts\deploy\update.ps1"
