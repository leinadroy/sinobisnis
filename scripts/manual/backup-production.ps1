# Full logical backup of the production database. Does not stop Tomcat or modify the database.
# Trial may run while Tomcat is active; Final requires the operator to freeze application input first.
param(
  [ValidateSet('Trial', 'Final')][string]$Mode = 'Trial',
  [switch]$InputStopped,
  [switch]$PreflightOnly
)
$ErrorActionPreference = 'Stop'
if ($Mode -eq 'Final' -and -not $InputStopped) {
  throw 'Backup final hanya setelah input Tomcat dihentikan. Jalankan ulang dengan -InputStopped setelah kondisi itu dipastikan.'
}

$dump = @('C:\xampp\mysql\bin\mariadb-dump.exe', 'C:\xampp\mysql\bin\mysqldump.exe') |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $dump) { throw 'Utilitas mariadb-dump.exe/mysqldump.exe tidak ditemukan di C:\xampp\mysql\bin.' }
$version = & $dump --version
if ($LASTEXITCODE -ne 0) { throw 'Gagal membaca versi mysqldump.' }
Write-Host "Backup tool: $version"

$drive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
$freeGiB = [math]::Round($drive.FreeSpace / 1GB, 1)
Write-Host "Ruang kosong C: $freeGiB GiB"
if ($freeGiB -lt 40) { throw 'Ruang kosong kurang dari 40 GiB; backup tidak dimulai.' }

$folder = 'C:\SinobisnisBackups'
New-Item -ItemType Directory -Path $folder -Force | Out-Null
& icacls.exe $folder /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Gagal membatasi akses folder backup; backup tidak dimulai.' }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$common = @(
  '--host=10.10.3.23', '--port=3306', '--protocol=tcp', '--user=gxmysql', '--password',
  '--single-transaction', '--quick', '--hex-blob', '--routines', '--events', '--triggers',
  '--default-character-set=utf8mb4', '--max-allowed-packet=1G'
)
if ($PreflightOnly) {
  $schema = Join-Path $folder "sinobisnis-schema-check-$stamp.sql"
  Write-Host 'Uji koneksi dan opsi dump tanpa menyalin isi tabel.'
  & $dump @common '--no-data' "--result-file=$schema" '--databases' 'sinobisnis'
  if ($LASTEXITCODE -ne 0) { throw "Uji dump gagal (exit $LASTEXITCODE). File parsial: $schema" }
  $bytes = (Get-Item -LiteralPath $schema).Length
  if ($bytes -lt 1KB) { throw "Hasil uji dump terlalu kecil: $schema" }
  Write-Host "Uji dump berhasil: $schema ($([math]::Round($bytes / 1KB, 1)) KiB)."
  exit 0
}
$out = Join-Path $folder "sinobisnis-$($Mode.ToLower())-$stamp.sql"
Write-Host "Tujuan: $out"
Write-Host 'Masukkan password database saat diminta oleh mysqldump. Password tidak ditampilkan atau disimpan di script.'
$started = Get-Date
& $dump @common "--result-file=$out" '--databases' 'sinobisnis'
$exit = $LASTEXITCODE
$elapsed = [math]::Round(((Get-Date) - $started).TotalMinutes, 1)
if ($exit -ne 0) {
  throw "mysqldump gagal (exit $exit) setelah $elapsed menit. File parsial, jika ada: $out"
}
$file = Get-Item -LiteralPath $out
if ($file.Length -lt 1MB) { throw "Dump terlalu kecil ($($file.Length) byte): $out" }

Write-Host "Dump selesai: $([math]::Round($file.Length / 1GB, 2)) GiB dalam $elapsed menit."
Write-Host 'Baris terakhir file:'
Get-Content -LiteralPath $out -Tail 2
$checksum = Get-FileHash -LiteralPath $out -Algorithm SHA256
$sumFile = "$out.sha256"
"$($checksum.Hash) *$($file.Name)" | Set-Content -LiteralPath $sumFile -Encoding Ascii
Write-Host "SHA256: $($checksum.Hash)"
Write-Host "Checksum file: $sumFile"
Write-Host 'Backup dasar selesai. Keberhasilan restore tetap perlu diuji terpisah.'
