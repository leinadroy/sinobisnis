# Siapkan konfigurasi fase migrasi pada VM 10.10.3.23.
# Tidak mengubah Tomcat, firewall, service, atau database production.
param(
  [int]$WebPort = 3001,
  [int]$ApiPort = 4000,
  [string]$WebHost = '10.10.3.23',
  [string]$StagingHost = '10.10.3.62',
  [string]$StagingDatabase = 'sinobisnis_staging'
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$apiEnv = Join-Path $root 'apps\api\.env'
$webEnv = Join-Path $root 'apps\web\.env.local'

if ($StagingHost -eq '10.10.3.23' -or $StagingDatabase -eq 'sinobisnis') {
  throw 'Konfigurasi ini hanya boleh menunjuk ke database staging, bukan production.'
}
if (Test-Path $apiEnv) { throw "Konfigurasi API sudah ada: $apiEnv. Periksa manual; file tidak ditimpa." }
if (Test-Path $webEnv) { throw "Konfigurasi web sudah ada: $webEnv. Periksa manual; file tidak ditimpa." }

$dbUser = Read-Host 'Username database staging'
if ([string]::IsNullOrWhiteSpace($dbUser)) { throw 'Username database wajib diisi.' }
$dbSecret = Read-Host 'Password database staging' -AsSecureString
$saltSecret = Read-Host 'SystemSalt GeneXus' -AsSecureString

function Reveal([Security.SecureString]$value) {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($value)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

$dbPass = Reveal $dbSecret
$systemSalt = Reveal $saltSecret
if (-not $dbPass -or $systemSalt -notmatch '^[0-9A-Fa-f]{64}$') { throw 'Password database kosong atau SystemSalt bukan 64 karakter hex.' }
$dbUrl = 'mysql://{0}:{1}@{2}:3306/{3}' -f [Uri]::EscapeDataString($dbUser), [Uri]::EscapeDataString($dbPass), $StagingHost, $StagingDatabase
$jwtBytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($jwtBytes)
$jwtSecret = [Convert]::ToBase64String($jwtBytes)
$utf8 = New-Object System.Text.UTF8Encoding($false)

$apiText = @'
DATABASE_URL="__DB_URL__"
JWT_SECRET="__JWT_SECRET__"
JWT_EXPIRES_IN="12h"
SYSTEM_SALT="__SYSTEM_SALT__"
HOST=localhost
PORT=__API_PORT__
WEB_ORIGIN="http://__WEB_HOST__:__WEB_PORT__"
DB_PROFILES=staging
DB_LABEL_STAGING=Staging
DB_URL_STAGING=${DATABASE_URL}
DB_PROFILE_DEFAULT=staging
DB_MENU_SYNC_STAGING=0
REMINDER_SCHEDULER=off
'@
$apiText = $apiText.Replace('__DB_URL__', $dbUrl).Replace('__JWT_SECRET__', $jwtSecret).Replace('__SYSTEM_SALT__', $systemSalt).Replace('__API_PORT__', [string]$ApiPort).Replace('__WEB_HOST__', $WebHost).Replace('__WEB_PORT__', [string]$WebPort)
$webText = @"
API_URL=http://localhost:$ApiPort/api
PDF_RENDER_ORIGIN=http://localhost:$WebPort
COOKIE_SECURE=0
"@
[IO.File]::WriteAllText($apiEnv, $apiText + "`n", $utf8)
[IO.File]::WriteAllText($webEnv, $webText, $utf8)
foreach ($file in @($apiEnv, $webEnv)) {
  & icacls.exe $file /inheritance:r /grant:r '*S-1-5-32-544:F' '*S-1-5-18:F' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Gagal membatasi akses ke $file." }
}
Write-Host 'Konfigurasi staging dibuat. Password dan JWT_SECRET tidak ditampilkan.'
Write-Host "API: localhost:$ApiPort; web: http://${WebHost}:$WebPort; database: $StagingHost/$StagingDatabase; reminder: off"
