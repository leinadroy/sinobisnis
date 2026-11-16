# Route only smlgroupid.com through the existing XAMPP Apache to Next.js.
# Keeps Apache's current TLS certificate; a valid public certificate is a separate gateway task.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$apache = 'C:\xampp\apache'
$httpd = Join-Path $apache 'bin\httpd.exe'
$main = Join-Path $apache 'conf\httpd.conf'
$extra = Join-Path $apache 'conf\extra\sinobisnis-proxy.conf'
$backupRoot = 'C:\SinobisnisBackups'
$backup = Join-Path $backupRoot ('apache-route-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$include = 'Include "conf/extra/sinobisnis-proxy.conf"'

if (-not (Test-Path $httpd) -or -not (Test-Path $main)) { throw 'Apache XAMPP tidak ditemukan.' }
if (-not (Test-Path (Join-Path $root 'apps\web\.next\BUILD_ID'))) { throw 'Build web belum ada.' }
$apiEnv = Join-Path $root 'apps\api\.env'
$dbState = Join-Path $root 'apps\api\config\db-profile.json'
if (-not (Test-Path $apiEnv) -or -not (Test-Path $dbState)) { throw 'Konfigurasi production API belum siap.' }
$apiSettings = [IO.File]::ReadAllText($apiEnv)
if ($apiSettings -notmatch '(?m)^DB_PROFILES=production\s*$' -or $apiSettings -notmatch '(?m)^DB_READONLY_PRODUCTION=0\s*$' -or (Get-Content $dbState -Raw | ConvertFrom-Json).active -ne 'production') {
  throw 'API belum diaktifkan untuk production; Apache tidak diubah.'
}
if ((Get-Service Apache2.4).Status -ne 'Running') { throw 'Apache2.4 harus Running.' }
if ((Get-Service Tomcat9).Status -ne 'Stopped') { throw 'Tomcat9 masih berjalan.' }
if (Test-Path $extra) { throw 'Konfigurasi proxy Sinobisnis sudah ada; tidak ditimpa.' }
if (([IO.File]::ReadAllText($main)).Contains($include)) { throw 'Include proxy Sinobisnis sudah ada.' }

$modules = (& $httpd -M 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Gagal membaca modul Apache.' }
foreach ($module in 'proxy_module','proxy_http_module','ssl_module','headers_module') {
  if ($modules -notmatch "(?m)^\s*$module\s+") { throw "Modul Apache belum aktif: $module" }
}
foreach ($url in 'http://127.0.0.1:3001/login','http://127.0.0.1:4000/api/health') {
  try { $null = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 5 }
  catch { throw "Aplikasi belum menjawab: $url" }
}
$cert = Join-Path $apache 'conf\ssl.crt\server.crt'
$key = Join-Path $apache 'conf\ssl.key\server.key'
if (-not (Test-Path $cert) -or -not (Test-Path $key)) { throw 'Berkas TLS Apache yang aktif tidak ditemukan.' }
$publicCert = [Security.Cryptography.X509Certificates.X509Certificate2]::new($cert)
if ($publicCert.NotAfter -le (Get-Date) -or $publicCert.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::DnsName, $false) -ne 'smlgroupid.com') {
  throw 'Sertifikat Apache belum valid untuk smlgroupid.com. Routing 80/443 tidak diubah.'
}

New-Item -ItemType Directory -Path $backup -Force | Out-Null
& icacls.exe $backup /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Tidak dapat membatasi akses backup.' }
Copy-Item -LiteralPath $main -Destination (Join-Path $backup 'httpd.conf') -ErrorAction Stop
Write-Host "Backup httpd.conf: $backup"

$proxy = @'
# Sinobisnis route. Remove this include to restore the previous Apache routing.
<VirtualHost *:80>
    ServerName smlgroupid.com
    ServerAlias www.smlgroupid.com
    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "http"
    ProxyPass / http://127.0.0.1:3001/
    ProxyPassReverse / http://127.0.0.1:3001/
</VirtualHost>
<VirtualHost *:443>
    ServerName smlgroupid.com
    ServerAlias www.smlgroupid.com
    SSLEngine on
    SSLCertificateFile "conf/ssl.crt/server.crt"
    SSLCertificateKeyFile "conf/ssl.key/server.key"
    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"
    ProxyPass / http://127.0.0.1:3001/
    ProxyPassReverse / http://127.0.0.1:3001/
</VirtualHost>
'@

$changed = $false
try {
  [IO.File]::WriteAllText($extra, $proxy, [Text.UTF8Encoding]::new($false))
  $mainText = [IO.File]::ReadAllText($main)
  [IO.File]::WriteAllText($main, $mainText.TrimEnd("`r", "`n") + "`r`n$include`r`n", [Text.UTF8Encoding]::new($false))
  $changed = $true
  $syntax = (& $httpd -t 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0) { throw "Sintaks Apache gagal: $syntax" }
  Restart-Service Apache2.4 -ErrorAction Stop
  Start-Sleep -Seconds 3
  if ((Get-Service Apache2.4).Status -ne 'Running') { throw 'Apache tidak Running setelah restart.' }
  foreach ($port in 80,443) {
    $args = @('-k','-sS','-o','NUL','-w','%{http_code}','--max-time','10','--resolve',"smlgroupid.com:${port}:127.0.0.1")
    $url = if ($port -eq 443) { 'https://smlgroupid.com/login' } else { 'http://smlgroupid.com/login' }
    $code = (& curl.exe @args $url 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $code -ne '200') { throw "Proxy port ${port} gagal, HTTP $code" }
    Write-Host "Port ${port}: halaman login HTTP $code"
  }
  Write-Host 'Routing Apache ke Sinobisnis aktif untuk smlgroupid.com.'
  Write-Warning 'Sertifikat Apache masih CN=localhost dan kedaluwarsa. Gateway/sertifikat publik belum selesai.'
} catch {
  $reason = $_.Exception.Message
  if ($changed) {
    Copy-Item -LiteralPath (Join-Path $backup 'httpd.conf') -Destination $main -Force
    Remove-Item -LiteralPath $extra -Force -ErrorAction SilentlyContinue
    Restart-Service Apache2.4 -ErrorAction SilentlyContinue
  }
  throw "Cutover Apache dibatalkan dan konfigurasi dipulihkan: $reason"
}
