# Run elevated on the VM. Starts an independent Next.js HTTPS task on 8443.
# Apache 80/443 and Tomcat are not changed. Passwords are entered only at tool prompts.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$web = Join-Path $root 'apps\web'
$node = (Get-Command node.exe -ErrorAction Stop).Source
$keytool = 'C:\Program Files\Java\jdk-11\bin\keytool.exe'
$openssl = 'C:\xampp\apache\bin\openssl.exe'
$jks = 'C:\Cert\sino.jks'
$certDir = 'C:\Cert\sinobisnis-8443'
$cert = Join-Path $certDir 'fullchain.pem'
$key = Join-Path $certDir 'private.key'
$backup = Join-Path 'C:\SinobisnisBackups' ('direct-https-8443-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$p12 = Join-Path $backup 'temporary.p12'
$taskName = 'SinobisnisHTTPS'
$firewallName = 'Sinobisnis HTTPS 8443'

foreach ($file in @($keytool,$openssl,$jks,(Join-Path $web 'server-https.cjs'),(Join-Path $web '.next\BUILD_ID'))) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Berkas diperlukan tidak ditemukan: $file" }
}
if ((Get-Service Tomcat9).Status -ne 'Stopped') { throw 'Tomcat9 harus berhenti.' }
if (@(Get-NetTCPConnection -State Listen -LocalPort 8443 -ErrorAction SilentlyContinue).Count) { throw 'Port 8443 sudah dipakai.' }
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { throw 'Task HTTPS sudah ada; tidak ditimpa.' }
if (Get-NetFirewallRule -DisplayName $firewallName -ErrorAction SilentlyContinue) { throw 'Aturan firewall 8443 sudah ada; tidak ditimpa.' }
if (Test-Path $certDir) { throw 'Folder sertifikat 8443 sudah ada; tidak ditimpa.' }
$apiEnv = Join-Path $root 'apps\api\.env'
$state = Join-Path $root 'apps\api\config\db-profile.json'
if (-not (Test-Path $apiEnv) -or -not (Test-Path $state)) { throw 'API production belum siap.' }
if ([IO.File]::ReadAllText($apiEnv) -notmatch '(?m)^DB_PROFILES=production\s*$' -or
    (Get-Content $state -Raw | ConvertFrom-Json).active -ne 'production') {
  throw 'API belum aktif pada production.'
}
try {
  $health = Invoke-RestMethod 'http://localhost:4000/api/health' -TimeoutSec 5
  if ($health.status -ne 'ok' -or $health.database -ne 'ok') { throw 'API tidak sehat.' }
} catch { throw "API belum sehat: $($_.Exception.Message)" }

New-Item -ItemType Directory -Path $backup,$certDir -Force | Out-Null
foreach ($dir in @($backup,$certDir)) {
  & icacls.exe $dir /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Gagal membatasi akses folder: $dir" }
}
Copy-Item -LiteralPath $jks -Destination (Join-Path $backup 'sino.jks') -ErrorAction Stop
& icacls.exe (Join-Path $backup 'sino.jks') /inheritance:r /grant:r '*S-1-5-32-544:F' '*S-1-5-18:F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Gagal membatasi akses salinan JKS.' }
Write-Host "Salinan keystore dengan akses terbatas: $backup"
Write-Host 'Keytool akan meminta password JKS dan password PKCS12 sementara.'
Write-Host 'OpenSSL akan meminta password PKCS12 sementara dua kali.'
Write-Host 'Jangan kirim password ketika mengirim output script.'

$taskRegistered = $false
$firewallCreated = $false
try {
  & $keytool -importkeystore -srckeystore $jks -srcalias 'smlgroupid.com' -destkeystore $p12 -deststoretype PKCS12 -destalias 'smlgroupid.com' -noprompt
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $p12)) { throw 'Konversi JKS gagal.' }
  & $openssl pkcs12 -in $p12 -nokeys -out $cert
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $cert)) { throw 'Ekspor sertifikat gagal.' }
  & $openssl pkcs12 -in $p12 -nocerts -nodes -out $key
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $key)) { throw 'Ekspor private key gagal.' }
  & icacls.exe $key /inheritance:r /grant:r '*S-1-5-32-544:F' '*S-1-5-18:F' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Tidak dapat membatasi akses private key.' }
  & $openssl x509 -in $cert -noout -checkend 0 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Sertifikat sudah kedaluwarsa.' }
  $names = (& $openssl x509 -in $cert -noout -ext subjectAltName 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0 -or $names -notmatch 'DNS:smlgroupid\.com(?:,|\s|$)') { throw 'Sertifikat bukan untuk smlgroupid.com.' }
  Remove-Item -LiteralPath $p12 -Force

  $action = New-ScheduledTaskAction -Execute $node -Argument 'server-https.cjs' -WorkingDirectory $web
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -MultipleInstances IgnoreNew -StartWhenAvailable
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -ErrorAction Stop | Out-Null
  $taskRegistered = $true
  New-NetFirewallRule -DisplayName $firewallName -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8443 -Profile Any -ErrorAction Stop | Out-Null
  $firewallCreated = $true
  Start-ScheduledTask -TaskName $taskName -ErrorAction Stop

  $ready = $false
  for ($i=0; $i -lt 25; $i++) {
    Start-Sleep -Seconds 2
    if (@(Get-NetTCPConnection -State Listen -LocalPort 8443 -ErrorAction SilentlyContinue).Count) { $ready = $true; break }
  }
  if (-not $ready) { throw 'Layanan HTTPS belum membuka port 8443 setelah 50 detik.' }
  $status = (& curl.exe -sS -o NUL -w '%{http_code}' --max-time 10 --resolve 'smlgroupid.com:8443:127.0.0.1' 'https://smlgroupid.com:8443/login' 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $status -ne '200') { throw "HTTPS 8443 belum sehat (hasil: $status)." }
  Write-Host 'Sinobisnis HTTPS 8443 aktif; sertifikat domain terverifikasi dan /login menjawab HTTP 200.'
  Write-Host 'Apache 80/443 dan task web 3001 tidak diubah.'
} catch {
  $reason = $_.Exception.Message
  if ($taskRegistered) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  }
  if ($firewallCreated) { Remove-NetFirewallRule -DisplayName $firewallName -ErrorAction SilentlyContinue }
  foreach ($file in @($key,$cert)) { Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $certDir -Force -ErrorAction SilentlyContinue
  throw "Setup HTTPS 8443 gagal; task dan firewall baru dibatalkan: $reason"
} finally {
  Remove-Item -LiteralPath $p12 -Force -ErrorAction SilentlyContinue
}
