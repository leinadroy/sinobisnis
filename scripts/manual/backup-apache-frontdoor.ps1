# Back up XAMPP Apache configuration/TLS files and inspect the active front door.
# Read-only for Apache itself: does not reload or change ports/routes.
$ErrorActionPreference = 'Stop'
$apache = 'C:\xampp\apache'
$conf = Join-Path $apache 'conf'
if (-not (Test-Path (Join-Path $conf 'httpd.conf'))) { throw 'Konfigurasi Apache XAMPP tidak ditemukan.' }
$service = Get-Service Apache2.4 -ErrorAction Stop
Write-Host "Apache2.4: $($service.Status), startup $($service.StartType)"

$backup = Join-Path 'C:\SinobisnisBackups' ("apache-frontdoor-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
& icacls.exe $backup /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Gagal membatasi akses folder backup Apache.' }
Copy-Item -LiteralPath $conf -Destination (Join-Path $backup 'conf') -Recurse -ErrorAction Stop
& icacls.exe $backup /T /inheritance:r /grant:r '*S-1-5-32-544:F' '*S-1-5-18:F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Gagal membatasi akses salinan konfigurasi Apache.' }
Write-Host "Salinan konfigurasi Apache: $backup"

$patterns = @(
  '^\s*(Listen|ServerName|ServerAlias|DocumentRoot|<VirtualHost|</VirtualHost|ProxyPass|ProxyPassReverse|JkMount|RewriteRule|SSLCertificateFile|SSLCertificateKeyFile|SSLCertificateChainFile|Include|IncludeOptional)\b'
)
$certificateFiles = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
Write-Host '=== Aturan virtual host, proxy, dan SSL (tanpa isi private key) ==='
Get-ChildItem -LiteralPath $conf -Recurse -File -Filter '*.conf' | ForEach-Object {
  $file = $_
  Select-String -LiteralPath $file.FullName -Pattern $patterns | ForEach-Object {
    $line = $_.Line.Trim()
    if ($line.StartsWith('#')) { return }
    # Mask a password if a proxy URL happens to contain user:password@host.
    $safe = $line -replace '(https?://)[^/@\s]+@', '$1***@'
    Write-Host "$($file.FullName):$($_.LineNumber): $safe"
    if ($line -match '^\s*SSLCertificate(?:Key|Chain)?File\s+["'']?([^"''\s]+)') {
      [void]$certificateFiles.Add($matches[1])
    }
  }
}

$external = Join-Path $backup 'external-certificates'
$copied = 0
foreach ($value in $certificateFiles) {
  $expanded = $value.Replace('${SRVROOT}', $apache).Replace('${HTTPD_ROOT}', $apache)
  if ($expanded -match '\$\{|%[^%]+%') {
    Write-Warning "Path sertifikat belum dapat diselesaikan: $value"
    continue
  }
  $path = if ([IO.Path]::IsPathRooted($expanded)) { $expanded } else { Join-Path $apache $expanded }
  $path = [IO.Path]::GetFullPath($path)
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    Write-Warning "Berkas sertifikat tidak ditemukan: $path"
    continue
  }
  $confPrefix = [IO.Path]::GetFullPath($conf).TrimEnd('\') + '\'
  if ($path.StartsWith($confPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    Write-Host "Sertifikat dalam salinan conf: $path"
    continue
  }
  New-Item -ItemType Directory -Path $external -Force | Out-Null
  $copied++
  $target = Join-Path $external ("{0:D2}-{1}" -f $copied, [IO.Path]::GetFileName($path))
  Copy-Item -LiteralPath $path -Destination $target -ErrorAction Stop
  & icacls.exe $target /inheritance:r /grant:r '*S-1-5-32-544:F' '*S-1-5-18:F' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Gagal membatasi akses salinan sertifikat eksternal.' }
  Write-Host "Sertifikat eksternal disalin: $path -> $target"
}

try {
  $tcp = [Net.Sockets.TcpClient]::new('127.0.0.1', 443)
  $tls = [Net.Security.SslStream]::new($tcp.GetStream(), $false, { $true })
  $tls.AuthenticateAsClient('smlgroupid.com')
  $cert = [Security.Cryptography.X509Certificates.X509Certificate2]::new($tls.RemoteCertificate)
  Write-Host "Sertifikat lokal dengan SNI smlgroupid.com: $($cert.Subject)"
  Write-Host "Berlaku sampai: $($cert.NotAfter.ToString('yyyy-MM-dd HH:mm:ss'))"
  Write-Host "Thumbprint: $($cert.Thumbprint)"
  $tls.Dispose(); $tcp.Dispose()
} catch {
  Write-Warning "Sertifikat untuk SNI smlgroupid.com belum terbaca: $($_.Exception.Message)"
}
Write-Host 'Apache tidak diubah.'
