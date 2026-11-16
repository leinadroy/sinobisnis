# Inventory Tomcat 80/443 and copy its TLS configuration/material to a restricted folder.
# Does not stop Tomcat, change ports, export private keys, or install a reverse proxy.
$ErrorActionPreference = 'Stop'
$service = Get-CimInstance Win32_Service -Filter "Name='Tomcat9'"
if (-not $service) { throw 'Service Tomcat9 tidak ditemukan.' }
$match = [regex]::Match($service.PathName, '^\s*"([^"]+\.exe)"|^\s*(\S+\.exe)')
if (-not $match.Success) { throw 'Lokasi executable Tomcat tidak dapat dibaca.' }
$exe = if ($match.Groups[1].Success) { $match.Groups[1].Value } else { $match.Groups[2].Value }
$base = Split-Path (Split-Path $exe -Parent) -Parent
$serverXml = Join-Path $base 'conf\server.xml'
if (-not (Test-Path $serverXml)) { throw "server.xml tidak ditemukan: $serverXml" }
[xml]$config = Get-Content -LiteralPath $serverXml -Raw

Write-Host "Tomcat9: $($service.State), startup $($service.StartMode)"
Write-Host "Tomcat base: $base"
Write-Host 'Konektor 80/443:'
$connectors = @($config.SelectNodes('//Connector')) | Where-Object { $_.GetAttribute('port') -in @('80','443') }
foreach ($connector in $connectors) {
  $hosts = @($connector.SelectNodes('.//SSLHostConfig')) | ForEach-Object { $_.GetAttribute('hostName') }
  [pscustomobject]@{
    Port = $connector.GetAttribute('port')
    Protocol = $connector.GetAttribute('protocol')
    SSL = $connector.GetAttribute('SSLEnabled')
    Hosts = ($hosts -join ',')
  } | Format-List
}

$folder = Join-Path 'C:\SinobisnisBackups' ("tomcat-ssl-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $folder -Force | Out-Null
& icacls.exe $folder /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Gagal membatasi akses folder backup SSL.' }
$xmlCopy = Join-Path $folder 'server.xml'
Copy-Item -LiteralPath $serverXml -Destination $xmlCopy -ErrorAction Stop
& icacls.exe $xmlCopy /inheritance:r /grant:r '*S-1-5-32-544:F' '*S-1-5-18:F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Gagal membatasi akses salinan server.xml.' }

$fileAttrs = @('keystoreFile','certificateKeystoreFile','certificateFile','certificateKeyFile','certificateChainFile','truststoreFile')
$seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$manifest = [Collections.Generic.List[string]]::new()
$count = 0
foreach ($connector in $connectors) {
  foreach ($node in @($connector) + @($connector.SelectNodes('.//*'))) {
    foreach ($attribute in @($node.Attributes)) {
      if ($attribute.Name -notin $fileAttrs -or [string]::IsNullOrWhiteSpace($attribute.Value)) { continue }
      $value = $attribute.Value.Trim()
      if ($value -match '\$\{|%[^%]+%') {
        $manifest.Add("UNRESOLVED`t$($attribute.Name)`t$value")
        continue
      }
      $source = if ([IO.Path]::IsPathRooted($value)) { $value } else { Join-Path $base $value }
      $source = [IO.Path]::GetFullPath($source)
      if (-not $seen.Add($source)) { continue }
      if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        $manifest.Add("MISSING`t$($attribute.Name)`t$source")
        continue
      }
      $count++
      $copy = Join-Path $folder ("{0:D2}-{1}" -f $count, [IO.Path]::GetFileName($source))
      Copy-Item -LiteralPath $source -Destination $copy -ErrorAction Stop
      & icacls.exe $copy /inheritance:r /grant:r '*S-1-5-32-544:F' '*S-1-5-18:F' | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "Gagal membatasi akses salinan $($attribute.Name)." }
      $manifest.Add("COPIED`t$($attribute.Name)`t$source`t$copy")
    }
  }
}
$manifestPath = Join-Path $folder 'manifest.txt'
[IO.File]::WriteAllLines($manifestPath, $manifest)
& icacls.exe $manifestPath /inheritance:r /grant:r '*S-1-5-32-544:F' '*S-1-5-18:F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Gagal membatasi akses manifest SSL.' }
Write-Host "Backup konfigurasi SSL: $folder"
Write-Host "Berkas SSL yang disalin: $count"
foreach ($line in $manifest) {
  $parts = $line -split "`t"
  Write-Host "$($parts[0]): $($parts[1]) $($parts[2])"
}

try {
  $tcp = [Net.Sockets.TcpClient]::new('127.0.0.1', 443)
  $tls = [Net.Security.SslStream]::new($tcp.GetStream(), $false, { $true })
  $tls.AuthenticateAsClient('localhost')
  $cert = [Security.Cryptography.X509Certificates.X509Certificate2]::new($tls.RemoteCertificate)
  Write-Host "Sertifikat aktif: $($cert.Subject)"
  Write-Host "Berlaku sampai: $($cert.NotAfter.ToString('yyyy-MM-dd HH:mm:ss'))"
  Write-Host "Thumbprint: $($cert.Thumbprint)"
  $tls.Dispose(); $tcp.Dispose()
} catch {
  Write-Warning "Metadata sertifikat aktif belum terbaca: $($_.Exception.Message)"
}
Write-Host "IIS W3SVC: $((Get-Service W3SVC -ErrorAction SilentlyContinue).Status)"
Write-Host 'Tomcat tidak diubah.'
