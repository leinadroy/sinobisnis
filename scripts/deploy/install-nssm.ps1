# Unduh NSSM resmi dan verifikasi checksum sebelum dipakai sebagai service wrapper.
# Tidak mengubah service yang sudah ada.
$ErrorActionPreference = 'Stop'
$url = 'https://nssm.cc/ci/nssm-2.24-101-g897c7ad.zip'
$expectedSha1 = 'ca2f6782a05af85facf9b620e047b01271edd11d'
$root = 'C:\apps\tools'
$archive = Join-Path $root 'nssm-2.24-101-g897c7ad.zip'
$extract = Join-Path $root 'nssm-2.24-101-g897c7ad'
$target = Join-Path $root 'nssm.exe'

if (Test-Path $target) { throw "NSSM sudah ada di $target; periksa versi sebelum mengganti." }
New-Item -ItemType Directory -Force $root | Out-Null
Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing
$actualSha1 = (Get-FileHash -LiteralPath $archive -Algorithm SHA1).Hash.ToLowerInvariant()
if ($actualSha1 -ne $expectedSha1) { throw "Checksum NSSM tidak cocok; arsip di $archive tidak diekstrak." }
Expand-Archive -LiteralPath $archive -DestinationPath $extract -Force
$candidate = Get-ChildItem -LiteralPath $extract -Recurse -Filter nssm.exe |
  Where-Object { $_.FullName -match '[\\/](win64|x64)[\\/]' } | Select-Object -First 1
if (-not $candidate) { throw 'nssm.exe 64-bit tidak ditemukan di arsip.' }
Copy-Item -LiteralPath $candidate.FullName -Destination $target
Write-Host "NSSM resmi terverifikasi dan siap di $target"
