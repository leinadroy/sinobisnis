# Adds a read-only production data profile while keeping staging for login.
# Run as Administrator on the Windows VM. Does not switch the active profile.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$envFile = Join-Path $root 'apps\api\.env'
$stateFile = Join-Path $root 'apps\api\config\db-profile.json'
if (-not (Test-Path $envFile)) { throw 'apps\api\.env tidak ditemukan.' }

$lines = [IO.File]::ReadAllLines($envFile)
$settings = @{}
foreach ($line in $lines) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
    $settings[$matches[1]] = $matches[2].Trim('"', "'")
  }
}
if ($settings['DB_PROFILES'] -ne 'staging' -or $settings['DB_PROFILE_DEFAULT'] -ne 'staging') {
  throw 'Profil VM saat ini bukan staging tunggal; periksa konfigurasi sebelum melanjutkan.'
}
if ($settings['DB_URL_PRODUCTION']) { throw 'Profil production sudah ada; file tidak diubah.' }
if ($settings['REMINDER_SCHEDULER'] -ne 'off') { throw 'Penjadwal reminder harus off.' }
if ((Test-Path $stateFile) -and ((Get-Content $stateFile -Raw | ConvertFrom-Json).active -ne 'staging')) {
  throw 'Profil database aktif yang tersimpan bukan staging.'
}
try { $staging = [Uri]$settings['DATABASE_URL'] } catch { throw 'DATABASE_URL staging tidak valid.' }
if ($staging.Host -ne '10.10.3.62' -or $staging.AbsolutePath.Trim('/') -ne 'sinobisnis_staging') {
  throw 'DATABASE_URL harus tetap menuju 10.10.3.62/sinobisnis_staging untuk login.'
}

$dbUser = Read-Host 'Username database production (tidak ditampilkan lagi)'
if ([string]::IsNullOrWhiteSpace($dbUser)) { throw 'Username database kosong.' }
$secret = Read-Host 'Password database production' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try { $dbPass = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
if (-not $dbPass) { throw 'Password database kosong.' }
$prodUrl = 'mysql://{0}:{1}@10.10.3.23:3306/sinobisnis' -f [Uri]::EscapeDataString($dbUser), [Uri]::EscapeDataString($dbPass)
$dbPass = $null

$updates = [ordered]@{
  DB_PROFILES = 'staging,production'
  DB_PROFILE_DEFAULT = 'staging'
  DB_URL_PRODUCTION = '"' + $prodUrl + '"'
  DB_READONLY_PRODUCTION = '1'
  DB_AUTH_PRODUCTION = 'staging'
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

$backup = "$envFile.before-production-$(Get-Date -Format yyyyMMdd-HHmmss).bak"
Copy-Item -LiteralPath $envFile -Destination $backup -ErrorAction Stop
& icacls.exe $backup /inheritance:r /grant:r '*S-1-5-32-544:F' '*S-1-5-18:F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Gagal membatasi akses file backup; konfigurasi belum diubah.' }
[IO.File]::WriteAllLines($envFile, $output, [Text.UTF8Encoding]::new($false))
& icacls.exe $envFile /inheritance:r /grant:r '*S-1-5-32-544:F' '*S-1-5-18:F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Gagal membatasi akses .env; periksa hak akses file.' }
Write-Host 'Profil production hanya baca ditambahkan; profil aktif tetap staging.'
Write-Host 'Login, role, dan session tetap memakai database staging.'
Write-Host "Backup konfigurasi: $backup"
