<#
  DEPLOY CEPAT dari laptop ke Windows Server lewat WinRM (default 10.10.3.23). Satu file, dijalankan di LAPTOP.

    .\scripts\deploy\deploy-remote.ps1                # build commit HEAD, kirim, pasang, restart
    .\scripts\deploy\deploy-remote.ps1 -CheckOnly     # hanya cek server (tidak mengubah apa pun)
    .\scripts\deploy\deploy-remote.ps1 -Rollback      # kembali ke versi sebelumnya di server
    .\scripts\deploy\deploy-remote.ps1 -Status        # status service + 30 baris log terakhir
    .\scripts\deploy\deploy-remote.ps1 -PackageOnly   # hanya build + paket di laptop (tanpa server)

  Yang dikerjakan:
    1. Login WinRM (username/password admin server diketik sendiri di jendela Windows; tidak disimpan).
    2. Cek server: disk, Edge/Chrome (PDF), port 3001/4000, jaringan ke production & staging.
    3. Build commit HEAD di folder terpisah (%LOCALAPPDATA%\sinobisnis-deploy) - dev server di laptop tidak terganggu.
       npm ci hanya diulang bila package-lock berubah.
    4. Kirim ke server: paket aplikasi (kecil) + paket node_modules & node.exe (besar, HANYA bila berubah).
       Server tidak perlu Node, npm, Git, NSSM, IIS, atau internet.
    5. Pasang di C:\apps\sinobisnis\releases\<versi>, pindahkan 'current', restart, cek health.
       Gagal -> otomatis kembali ke versi sebelumnya.

  Hasil: web http://<server>:3001 (API hanya 127.0.0.1:4000 di server). Apache XAMPP (80/443) dan Tomcat (8080)
  di server TIDAK disentuh. Service = Scheduled Task "SinobisnisAPI" & "SinobisnisWeb" (jalan saat server menyala,
  restart sendiri bila mati). Log: C:\apps\sinobisnis\logs\api.log, web.log.

  Database (deploy pertama, .env dibuat di server dari .env laptop; deploy berikutnya .env server tidak diubah):
    - profil aktif = production, HANYA BACA (DB_READONLY_PRODUCTION=1, sama seperti di laptop)
    - login/user/role dari staging 10.10.3.62 (DB_AUTH_PRODUCTION=staging)
    - reminder otomatis mati (REMINDER_SCHEDULER=off), JWT_SECRET baru khusus server

  Sekali saja di laptop (PowerShell SEBAGAI ADMINISTRATOR), agar WinRM boleh ke server lewat IP:
    Start-Service WinRM
    Set-Item WSMan:\localhost\Client\TrustedHosts -Value 10.10.3.23 -Concatenate -Force
#>
param(
  [string]$Server = "10.10.3.23",
  [int]$WebPort = 3001,
  [int]$ApiPort = 4000,
  [string]$AppDir = "C:\apps\sinobisnis",
  [string]$PublicUrl = "",
  [pscredential]$Credential,
  [switch]$CheckOnly,
  [switch]$Rollback,
  [switch]$Status,
  [switch]$SkipBuild,
  [switch]$PackageOnly,
  [int]$KeepReleases = 3
)
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if (-not $PublicUrl) { $PublicUrl = "http://${Server}:$WebPort" }
$work = Join-Path $env:LOCALAPPDATA "sinobisnis-deploy"
$build = Join-Path $work "build"
$out = Join-Path $work "out"
$bsdtar = Join-Path $env:windir "System32\tar.exe"   # bsdtar bawaan Windows (bisa membuat .zip)
$utf8 = New-Object System.Text.UTF8Encoding($false)
$sw = [Diagnostics.Stopwatch]::StartNew()

function Step([string]$t) { Write-Host ""; Write-Host ("=== {0}  [{1:mm\:ss}]" -f $t, $sw.Elapsed) -ForegroundColor Cyan }
function Ok([string]$t) { Write-Host "  [OK] $t" -ForegroundColor Green }
function Warn([string]$t) { Write-Host "  [!]  $t" -ForegroundColor Yellow }
function Fail([string]$t) { Write-Host ""; Write-Host "GAGAL: $t" -ForegroundColor Red; exit 1 }
function Run([string]$What, [scriptblock]$Cmd) {
  Write-Host "  > $What"
  & $Cmd
  if ($LASTEXITCODE -ne 0) { throw "$What gagal (exit $LASTEXITCODE)." }
}
function Mb([string]$f) { "{0:N1} MB" -f ((Get-Item $f).Length / 1MB) }

# ------------------------------------------------------------------ fungsi yang dijalankan DI SERVER
# Hapus folder tanpa mengikuti junction (rd /s tidak masuk ke junction; Remove-Item di PS 5.1 bisa menghapus isi target).
$remoteLib = @'
function RmTree([string]$p) { if (Test-Path -LiteralPath $p) { cmd /c "rd /s /q `"$p`"" | Out-Null } }
# rmdir pada junction hanya menghapus link-nya; dijalankan tanpa Test-Path karena junction yang targetnya belum ada
# dianggap tidak ada oleh Test-Path.
function RmLink([string]$p) { cmd /c "rmdir `"$p`" 2>nul" | Out-Null }
function Junction([string]$link, [string]$target) {
  RmLink $link
  cmd /c "mklink /J `"$link`" `"$target`"" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Gagal membuat junction $link -> $target" }
}
function StopApp([string]$AppDir) {
  foreach ($t in "SinobisnisWeb", "SinobisnisAPI") {
    if (Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue }
  }
  # Runner PowerShell + node.exe milik aplikasi ini saja (dicari dari path), bukan proses lain di server.
  $esc = [regex]::Escape($AppDir)
  Get-CimInstance Win32_Process | Where-Object {
    ($_.Name -eq 'node.exe' -and $_.ExecutablePath -match "^$esc") -or
    ($_.Name -eq 'powershell.exe' -and $_.CommandLine -match "$esc\\run-(api|web)\.ps1")
  } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
}
function StartApp {
  Start-ScheduledTask -TaskName "SinobisnisAPI"
  Start-Sleep -Seconds 3
  Start-ScheduledTask -TaskName "SinobisnisWeb"
}
function Health([int]$ApiPort, [int]$WebPort, [int]$Seconds = 120) {
  $api = $false; $web = $false; $until = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $until -and -not ($api -and $web)) {
    if (-not $api) { try { $r = Invoke-WebRequest "http://127.0.0.1:$ApiPort/api/health" -UseBasicParsing -TimeoutSec 5; $api = $r.StatusCode -eq 200 } catch {} }
    if ($api -and -not $web) { try { $r = Invoke-WebRequest "http://127.0.0.1:$WebPort/login" -UseBasicParsing -TimeoutSec 10; $web = $r.StatusCode -eq 200 } catch {} }
    if (-not ($api -and $web)) { Start-Sleep -Seconds 3 }
  }
  $body = try { (Invoke-WebRequest "http://127.0.0.1:$ApiPort/api/health" -UseBasicParsing -TimeoutSec 5).Content } catch { "$_" }
  [pscustomobject]@{ Api = $api; Web = $web; ApiBody = $body }
}
'@

# ------------------------------------------------------------------ 1. Koneksi
$s = $null
if ($PackageOnly) {
  # Hanya build + paket di laptop (tanpa server): untuk uji paket atau dipasang manual.
  $info = [pscustomobject]@{ Deps = @() }
} else {
Step "1. Koneksi WinRM ke $Server"
try { Test-WSMan -ComputerName $Server -ErrorAction Stop | Out-Null; Ok "WinRM server menjawab" }
catch { Fail "WinRM $Server`:5985 tidak menjawab ($($_.Exception.Message.Split([char]10)[0]))." }
$th = try { (Get-Item WSMan:\localhost\Client\TrustedHosts -ErrorAction Stop).Value } catch { "" }
if ($th -ne "*" -and ($th -split ",\s*") -notcontains $Server) {
  Fail ("Laptop belum mempercayai $Server untuk WinRM. Jalankan SEKALI di PowerShell sebagai Administrator:`n" +
    "    Start-Service WinRM`n    Set-Item WSMan:\localhost\Client\TrustedHosts -Value $Server -Concatenate -Force")
}
if (-not $Credential) {
  $Credential = Get-Credential -Message "Akun ADMINISTRATOR server $Server (mis. $Server\Administrator)"
  if (-not $Credential) { Fail "Login dibatalkan." }
}
try { $s = New-PSSession -ComputerName $Server -Credential $Credential -ErrorAction Stop }
catch { Fail "Login WinRM gagal: $($_.Exception.Message.Split([char]10)[0])" }
Ok "Masuk sebagai $($Credential.UserName)"
# Simpan fungsi server di sesi; tiap blok di bawah memuatnya dengan . ([scriptblock]::Create($global:__lib)).
Invoke-Command -Session $s -ScriptBlock { param($lib) $global:__lib = $lib; . ([scriptblock]::Create($lib)) } -ArgumentList $remoteLib | Out-Null
}

try {
  # ---------------------------------------------------------------- Status / Rollback
  if ($Status) {
    Step "Status"
    Invoke-Command -Session $s -ArgumentList $AppDir, $ApiPort, $WebPort -ScriptBlock {
      param($AppDir, $ApiPort, $WebPort)
      . ([scriptblock]::Create($global:__lib))
      Get-ScheduledTask -TaskName "Sinobisnis*" -ErrorAction SilentlyContinue | Select-Object TaskName, State | Format-Table -AutoSize | Out-String | Write-Host
      if (Test-Path "$AppDir\current\VERSION.txt") { Write-Host ("Versi aktif: " + (Get-Content "$AppDir\current\VERSION.txt" -Raw)) }
      $h = Health $ApiPort $WebPort 5; Write-Host "API: $($h.Api)  Web: $($h.Web)  $($h.ApiBody)"
      foreach ($l in "api", "web") { if (Test-Path "$AppDir\logs\$l.log") { Write-Host "`n--- $l.log ---"; Get-Content "$AppDir\logs\$l.log" -Tail 30 | Write-Host } }
    }
    return
  }
  if ($Rollback) {
    Step "Rollback ke versi sebelumnya"
    Invoke-Command -Session $s -ArgumentList $AppDir, $ApiPort, $WebPort -ScriptBlock {
      param($AppDir, $ApiPort, $WebPort)
      . ([scriptblock]::Create($global:__lib))
      $prevFile = "$AppDir\previous.txt"
      if (-not (Test-Path $prevFile)) { throw "Tidak ada versi sebelumnya." }
      $prev = (Get-Content $prevFile -Raw).Trim()
      if (-not (Test-Path "$AppDir\releases\$prev")) { throw "Folder versi $prev sudah tidak ada." }
      $cur = (Get-Item "$AppDir\current").Target | Select-Object -First 1
      StopApp $AppDir
      Junction "$AppDir\current" "$AppDir\releases\$prev"
      if ($cur) { Set-Content $prevFile (Split-Path $cur -Leaf) }
      # Runner menunjuk node.exe milik versi itu
      Copy-Item "$AppDir\releases\$prev\run-api.ps1", "$AppDir\releases\$prev\run-web.ps1" $AppDir -Force
      StartApp
      $h = Health $ApiPort $WebPort
      Write-Host "Aktif: $prev  API: $($h.Api)  Web: $($h.Web)"
    }
    return
  }

  # ---------------------------------------------------------------- 2. Cek server
  if (-not $PackageOnly) {
  Step "2. Cek server"
  $info = Invoke-Command -Session $s -ArgumentList $AppDir, $ApiPort, $WebPort -ScriptBlock {
    param($AppDir, $ApiPort, $WebPort)
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    $os = (Get-CimInstance Win32_OperatingSystem).Caption
    $drive = (Split-Path $AppDir -Qualifier)
    $free = [math]::Round((Get-PSDrive ($drive.TrimEnd(':'))).Free / 1GB, 1)
    $browser = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
      "$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe") |
      Where-Object { Test-Path $_ } | Select-Object -First 1
    $ports = @{}
    foreach ($p in $ApiPort, $WebPort) {
      $c = Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue | Select-Object -First 1
      $ports["$p"] = if ($c) { $pr = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)"; "$($pr.Name) $($pr.ExecutablePath)" } else { "" }
    }
    function Tcp($h, $p) { $t = New-Object Net.Sockets.TcpClient; try { $t.ConnectAsync($h, $p).Wait(3000) } catch { $false } finally { $t.Close() } }
    $tar = Test-Path "$env:windir\System32\tar.exe"
    $deps = if (Test-Path "$AppDir\deps") { @(Get-ChildItem "$AppDir\deps" -Directory | Where-Object { Test-Path "$($_.FullName)\.complete" } | ForEach-Object Name) } else { @() }
    $ver = if (Test-Path "$AppDir\current\VERSION.txt") { (Get-Content "$AppDir\current\VERSION.txt" -Raw).Trim() } else { "" }
    $tz = (Get-TimeZone).Id
    [pscustomobject]@{ Admin = $isAdmin; Os = $os; Free = $free; Browser = $browser; Ports = $ports; Tar = $tar; Deps = $deps; Version = $ver; Tz = $tz
      Prod = (Tcp "10.10.3.23" 3306); Staging = (Tcp "10.10.3.62" 3306) }
  }
  $problems = @()
  Ok "$($info.Os)"
  if ($info.Admin) { Ok "Akun administrator" } else { $problems += "Akun $($Credential.UserName) bukan administrator di server." }
  if ($info.Free -ge 3) { Ok "Disk kosong $($info.Free) GB" } else { $problems += "Disk kosong hanya $($info.Free) GB (butuh minimal 3 GB)." }
  if ($info.Browser) { Ok "Browser untuk PDF: $($info.Browser)" } else { Warn "Edge/Chrome tidak ada: aplikasi jalan, tapi PDF invoice tidak bisa dibuat." }
  if ($info.Tar) { Ok "tar.exe tersedia" } else { Warn "tar.exe tidak ada (Windows lama): ekstrak memakai Expand-Archive, lebih lambat." }
  foreach ($p in $ApiPort, $WebPort) {
    $owner = $info.Ports["$p"]
    if (-not $owner) { Ok "Port $p kosong" }
    elseif ($owner -match [regex]::Escape($AppDir)) { Ok "Port $p dipakai versi lama aplikasi ini (akan di-restart)" }
    else { $problems += "Port $p sudah dipakai program lain: $owner. Pakai -WebPort / -ApiPort lain." }
  }
  if ($info.Prod) { Ok "Production 10.10.3.23:3306 terjangkau" } else { $problems += "Server tidak bisa ke production 10.10.3.23:3306." }
  if ($info.Staging) { Ok "Staging 10.10.3.62:3306 terjangkau (login)" } else { $problems += "Server tidak bisa ke staging 10.10.3.62:3306 (dipakai untuk login)." }
  if ($info.Tz -ne "SE Asia Standard Time") { Warn "Zona waktu server '$($info.Tz)'. Aplikasi memakai TZ=Asia/Jakarta sendiri, jadi aman." }
  if ($info.Version) { Ok "Versi terpasang sekarang: $($info.Version)" } else { Ok "Belum pernah di-deploy (deploy pertama)" }
  if ($problems.Count) { $problems | ForEach-Object { Write-Host "  [X]  $_" -ForegroundColor Red }; Fail "Server belum siap." }
  if ($CheckOnly) { Step "Selesai (-CheckOnly, tidak ada yang diubah)"; return }
  }

  # ---------------------------------------------------------------- 3. Build di laptop
  Set-Location $repo
  $commit = (git rev-parse --short HEAD).Trim()
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if (git status --porcelain --untracked-files=no) { Warn "Ada perubahan yang belum di-commit; yang di-deploy hanya commit $commit." }
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $release = "$stamp-$commit"
  $nodeExe = (Get-Command node.exe).Source
  $nodeVer = (& node -v).Trim()
  $locks = "packages\shared\package-lock.json", "apps\api\package-lock.json", "apps\web\package-lock.json"
  $sha = [Security.Cryptography.SHA256]::Create()
  # Kunci cache node_modules = lockfile di commit HEAD (bukan working tree) + versi Node.
  $lockText = (($locks | ForEach-Object { (git show "HEAD:$($_ -replace '\\','/')") -join "`n" }) -join "`n") + $nodeVer
  $depsKey = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($lockText))) -replace "-", "").Substring(0, 12).ToLower()

  if ($SkipBuild -and (Test-Path (Join-Path $build "VERSION.txt"))) {
    Warn "-SkipBuild: memakai hasil build terakhir ($((Get-Content (Join-Path $build 'VERSION.txt') -Raw).Trim()))."
  } else {
    Step "3. Build commit $commit ($branch) di $build"
    New-Item -ItemType Directory -Force $build, $out | Out-Null
    # Bersihkan kode lama tapi pertahankan node_modules (cache npm ci).
    foreach ($d in "packages\shared", "apps\api", "apps\web") {
      $full = Join-Path $build $d
      if (Test-Path $full) { Get-ChildItem $full -Force | Where-Object { $_.Name -ne "node_modules" } | ForEach-Object { cmd /c "rd /s /q `"$($_.FullName)`"" 2>$null; if (Test-Path $_.FullName) { Remove-Item $_.FullName -Force } } }
    }
    $tarFile = Join-Path $out "src.tar"
    Run "git archive $commit" { git archive --format=tar -o $tarFile HEAD packages/shared apps/api apps/web }
    Run "ekstrak kode" { & $bsdtar -xf $tarFile -C $build }
    Remove-Item $tarFile
    Set-Location $build
    $env:npm_config_legacy_peer_deps = "true"   # lockfile dibuat dengan setelan ini
    $env:NEXT_TELEMETRY_DISABLED = "1"
    $keyFile = Join-Path $build ".deps-key"
    $haveKey = if (Test-Path $keyFile) { (Get-Content $keyFile -Raw).Trim() } else { "" }
    if ($haveKey -ne $depsKey) {
      Remove-Item $keyFile -ErrorAction SilentlyContinue
      Run "npm ci packages/shared" { npm ci --prefix packages/shared --no-audit --no-fund }
      Run "npm ci apps/api (1-3 menit)" { npm ci --prefix apps/api --no-audit --no-fund }
      Run "npm ci apps/web (1-3 menit)" { npm ci --prefix apps/web --no-audit --no-fund }
      Set-Content $keyFile $depsKey
    } else { Ok "node_modules sama dengan build sebelumnya (npm ci dilewati)" }
    Run "build packages/shared" { npm run build --prefix packages/shared }
    $env:DATABASE_URL = "mysql://build:build@localhost:3306/build"   # prisma generate tidak konek ke database
    Run "build apps/api" { npm run build --prefix apps/api }
    Remove-Item Env:\DATABASE_URL
    Run "build apps/web (1-3 menit)" { npm run build --prefix apps/web }
    [IO.File]::WriteAllText((Join-Path $build "VERSION.txt"), "$release ($branch) dibuat $(Get-Date -Format 'yyyy-MM-dd HH:mm') dari $env:COMPUTERNAME", $utf8)
    Set-Location $repo
    Ok "Build selesai"
  }
  $release = ((Get-Content (Join-Path $build "VERSION.txt") -Raw).Trim() -split " ")[0]
  $depsKey = (Get-Content (Join-Path $build ".deps-key") -Raw).Trim()

  # ---------------------------------------------------------------- 4. Paket
  Step "4. Paket"
  $appZip = Join-Path $out "app-$release.zip"
  Get-ChildItem $out -Filter "app-*.zip" | Remove-Item -Force
  Run "paket aplikasi" {
    & $bsdtar -a -c -f $appZip -C $build --exclude "node_modules" --exclude ".next/cache" --exclude ".env" --exclude ".env.*" `
      VERSION.txt packages/shared apps/api apps/web
  }
  Ok "app-$release.zip $(Mb $appZip)"
  $needDeps = $info.Deps -notcontains $depsKey
  $depsZip = Join-Path $out "deps-$depsKey.zip"
  if ($needDeps) {
    if (-not (Test-Path $depsZip)) {
      Get-ChildItem $out -Filter "deps-*.zip" | Remove-Item -Force
      $nodeDir = Join-Path $out "node"; New-Item -ItemType Directory -Force $nodeDir | Out-Null
      Copy-Item $nodeExe (Join-Path $nodeDir "node.exe") -Force
      # @sml/shared di node_modules adalah junction ke packages/shared: tidak ikut, dibuat ulang di server.
      Run "paket node_modules + node.exe $nodeVer (sekali per perubahan lockfile)" {
        & $bsdtar -a -c -f $depsZip --exclude "*/node_modules/@sml/shared" --exclude "*/node_modules/.cache" `
          -C $build apps/api/node_modules apps/web/node_modules -C $nodeDir node.exe
      }
    }
    Ok "deps-$depsKey.zip $(Mb $depsZip)"
  } else { Ok "node_modules di server sudah versi ini ($depsKey) - tidak dikirim ulang" }
  if ($PackageOnly) {
    Step "Selesai (-PackageOnly, tidak ada yang dikirim)"
    Write-Host "  $appZip"; Write-Host "  $depsZip"
    return
  }

  # ---------------------------------------------------------------- 5. Kirim
  Step "5. Kirim ke server"
  Invoke-Command -Session $s -ArgumentList $AppDir -ScriptBlock { param($AppDir) New-Item -ItemType Directory -Force "$AppDir\incoming" | Out-Null }
  if ($needDeps) { Write-Host "  > deps ($(Mb $depsZip))"; Copy-Item $depsZip -Destination "$AppDir\incoming\" -ToSession $s -Force }
  Write-Host "  > aplikasi ($(Mb $appZip))"; Copy-Item $appZip -Destination "$AppDir\incoming\" -ToSession $s -Force
  Ok "Terkirim"

  # ---------------------------------------------------------------- 6. .env server (deploy pertama saja)
  Step "6. Konfigurasi server"
  $firstEnv = Invoke-Command -Session $s -ArgumentList $AppDir -ScriptBlock { param($AppDir) -not (Test-Path "$AppDir\shared\api.env") }
  $rootEnvText = $null; $apiEnvText = $null
  if ($firstEnv) {
    $rootLocal = Join-Path $repo ".env"
    if (-not (Test-Path $rootLocal)) { Fail ".env root di laptop tidak ada (butuh DB_* dan STAGING_DB_*)." }
    $keep = Get-Content $rootLocal | Where-Object { $_ -match '^(DB_(HOST|PORT|NAME|USER|PASS)|STAGING_DB_(HOST|PORT|NAME|USER|PASS))=' }
    if (($keep | Where-Object { $_ -match '^DB_' }).Count -lt 5 -or ($keep | Where-Object { $_ -match '^STAGING_DB_' }).Count -lt 5) {
      Fail ".env root di laptop belum lengkap (butuh DB_HOST/PORT/NAME/USER/PASS dan STAGING_DB_*)."
    }
    $rootEnvText = "# Dibuat deploy-remote.ps1 $(Get-Date -Format 'yyyy-MM-dd'). Kredensial production (dibuka HANYA BACA) & staging (login).`r`n" + ($keep -join "`r`n") + "`r`n"
    $bytes = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $apiEnvText = @'
# Dibuat deploy-remote.ps1. JANGAN di-commit. Deploy berikutnya tidak mengubah file ini.
JWT_SECRET="__JWT__"
JWT_EXPIRES_IN="12h"
PORT=__APIPORT__
WEB_ORIGIN="__URL__"

# Profil database (Developer Menu -> Database). Kredensial ada di .env root (DB_ENV_FILE).
DB_PROFILES=production,staging
DB_ENV_FILE=../../.env
DB_LABEL_PRODUCTION=Production (hanya baca)
DB_URL_PRODUCTION=mysql://${DB_USER:url}:${DB_PASS:url}@${DB_HOST}:${DB_PORT}/${DB_NAME}
# JANGAN diubah ke 0 kecuali hari go-live yang sudah disepakati.
DB_READONLY_PRODUCTION=1
DB_WRITE_USERS_PRODUCTION=0
DB_MENU_SYNC_PRODUCTION=0
# Login, user & role dari staging (password bcrypt). Production tidak ditulis sama sekali.
DB_AUTH_PRODUCTION=staging
DB_LABEL_STAGING=Staging (server 10.10.3.62)
DB_URL_STAGING=mysql://${STAGING_DB_USER:url}:${STAGING_DB_PASS:url}@${STAGING_DB_HOST}:${STAGING_DB_PORT}/${STAGING_DB_NAME}
DB_PROFILE_DEFAULT=production

# Reminder masih dikirim aplikasi lama.
REMINDER_SCHEDULER=off
'@
    $apiEnvText = $apiEnvText.Replace("__JWT__", [Convert]::ToBase64String($bytes)).Replace("__APIPORT__", "$ApiPort").Replace("__URL__", $PublicUrl).Replace("`n", "`r`n")
    Ok "Deploy pertama: .env server dibuat dari .env laptop (production hanya baca, login dari staging, JWT_SECRET baru)"
  }

  # ---------------------------------------------------------------- 7. Pasang & restart
  Step "7. Pasang & restart di server"
  $result = Invoke-Command -Session $s -ArgumentList $AppDir, $release, $depsKey, $needDeps, $ApiPort, $WebPort, $PublicUrl, $info.Browser, $rootEnvText, $apiEnvText, $KeepReleases -ScriptBlock {
    param($AppDir, $release, $depsKey, $needDeps, $ApiPort, $WebPort, $PublicUrl, $Browser, $rootEnvText, $apiEnvText, $Keep)
    $ErrorActionPreference = "Stop"
    . ([scriptblock]::Create($global:__lib))
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    function Unzip([string]$zip, [string]$dest) {
      New-Item -ItemType Directory -Force $dest | Out-Null
      if (Test-Path "$env:windir\System32\tar.exe") { & "$env:windir\System32\tar.exe" -xf $zip -C $dest; if ($LASTEXITCODE) { throw "Ekstrak $zip gagal." } }
      else { Expand-Archive $zip $dest -Force }
    }
    foreach ($d in "releases", "deps", "logs", "shared\config") { New-Item -ItemType Directory -Force "$AppDir\$d" | Out-Null }
    # Folder shared berisi password: hanya Administrators & SYSTEM.
    icacls "$AppDir\shared" /inheritance:r /grant:r "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-18:(OI)(CI)F" | Out-Null
    if ($rootEnvText) { [IO.File]::WriteAllText("$AppDir\shared\root.env", $rootEnvText, $utf8) }
    if ($apiEnvText) { [IO.File]::WriteAllText("$AppDir\shared\api.env", $apiEnvText, $utf8) }

    # node_modules + node.exe (hanya bila baru)
    $deps = "$AppDir\deps\$depsKey"
    if ($needDeps) {
      RmTree $deps
      Write-Host "  > ekstrak node_modules (1-3 menit)"
      Unzip "$AppDir\incoming\deps-$depsKey.zip" $deps
      foreach ($a in "api", "web") {
        New-Item -ItemType Directory -Force "$deps\apps\$a\node_modules\@sml" | Out-Null
        Junction "$deps\apps\$a\node_modules\@sml\shared" "$AppDir\current\packages\shared"
      }
      Set-Content "$deps\.complete" (Get-Date)
      Remove-Item "$AppDir\incoming\deps-$depsKey.zip" -Force
    }
    $node = "$deps\node.exe"
    if (-not (Test-Path $node)) { throw "node.exe tidak ada di $deps" }

    # Versi baru
    $rel = "$AppDir\releases\$release"
    RmTree $rel
    Write-Host "  > ekstrak aplikasi"
    Unzip "$AppDir\incoming\app-$release.zip" $rel
    Remove-Item "$AppDir\incoming\app-$release.zip" -Force
    Junction "$rel\apps\api\node_modules" "$deps\apps\api\node_modules"
    Junction "$rel\apps\web\node_modules" "$deps\apps\web\node_modules"
    Copy-Item "$AppDir\shared\api.env" "$rel\apps\api\.env" -Force
    Copy-Item "$AppDir\shared\root.env" "$rel\.env" -Force

    # Runner: loop yang menyalakan ulang node bila mati + rotasi log 10 MB. Disimpan per versi (rollback ikut benar).
    $runner = @'
param([string]$Name)
$ErrorActionPreference = "Continue"
$log = "__APP__\logs\$Name.log"
while ($true) {
  if ((Test-Path $log) -and (Get-Item $log).Length -gt 10MB) { Move-Item $log "$log.1" -Force }
  Add-Content $log "`r`n==== start $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===="
  __BODY__
  Start-Sleep -Seconds 5
}
'@
    $api = @"
`$env:NODE_ENV='production'; `$env:HOST='127.0.0.1'; `$env:PORT='$ApiPort'; `$env:TZ='Asia/Jakarta'; `$env:WEB_ORIGIN='$PublicUrl'
  `$env:DB_PROFILE_FILE='$AppDir\shared\config\db-profile.json'; `$env:REMINDER_SCHEDULER='off'
  Set-Location '$AppDir\current\apps\api'
  `$cmdline = '"$node" dist\main.js >> "' + `$log + '" 2>&1'; cmd /c `$cmdline
"@
    $web = @"
`$env:NODE_ENV='production'; `$env:PORT='$WebPort'; `$env:TZ='Asia/Jakarta'; `$env:NEXT_TELEMETRY_DISABLED='1'
  `$env:API_URL='http://127.0.0.1:$ApiPort/api'; `$env:PDF_RENDER_ORIGIN='http://127.0.0.1:$WebPort'; `$env:COOKIE_SECURE='$(if ($PublicUrl -like 'https://*') { '1' } else { '0' })'
  `$env:PDF_BROWSER_PATH='$Browser'
  Set-Location '$AppDir\current\apps\web'
  `$cmdline = '"$node" node_modules\next\dist\bin\next start -p $WebPort -H 0.0.0.0 >> "' + `$log + '" 2>&1'; cmd /c `$cmdline
"@
    $runner = $runner.Replace("__APP__", $AppDir)
    [IO.File]::WriteAllText("$rel\run-api.ps1", $runner.Replace("__BODY__", $api), $utf8)
    [IO.File]::WriteAllText("$rel\run-web.ps1", $runner.Replace("__BODY__", $web), $utf8)

    # Scheduled Task (sekali): jalan saat server menyala sebagai SYSTEM, tanpa batas waktu.
    foreach ($t in @(@{ N = "SinobisnisAPI"; F = "run-api.ps1"; A = "api" }, @{ N = "SinobisnisWeb"; F = "run-web.ps1"; A = "web" })) {
      if (-not (Get-ScheduledTask -TaskName $t.N -ErrorAction SilentlyContinue)) {
        $act = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$AppDir\$($t.F)`" -Name $($t.A)"
        $trg = New-ScheduledTaskTrigger -AtStartup
        $set = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
        $pr = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
        Register-ScheduledTask -TaskName $t.N -Action $act -Trigger $trg -Settings $set -Principal $pr -Description "Sinobisnis ($AppDir)" | Out-Null
      }
    }
    if (-not (Get-NetFirewallRule -DisplayName "Sinobisnis web $WebPort" -ErrorAction SilentlyContinue)) {
      New-NetFirewallRule -DisplayName "Sinobisnis web $WebPort" -Direction Inbound -Protocol TCP -LocalPort $WebPort -Action Allow | Out-Null
    }

    # Ganti versi
    $prev = if (Test-Path "$AppDir\current") { Split-Path ((Get-Item "$AppDir\current").Target | Select-Object -First 1) -Leaf } else { "" }
    StopApp $AppDir
    Junction "$AppDir\current" $rel
    Copy-Item "$rel\run-api.ps1", "$rel\run-web.ps1" $AppDir -Force
    StartApp
    $h = Health $ApiPort $WebPort 150
    $rolledBack = $false
    if (-not ($h.Api -and $h.Web) -and $prev -and (Test-Path "$AppDir\releases\$prev")) {
      Write-Host "  [!] Versi baru tidak sehat, kembali ke $prev" -ForegroundColor Yellow
      StopApp $AppDir
      Junction "$AppDir\current" "$AppDir\releases\$prev"
      Copy-Item "$AppDir\releases\$prev\run-api.ps1", "$AppDir\releases\$prev\run-web.ps1" $AppDir -Force
      StartApp
      $rolledBack = $true
      $h2 = Health $ApiPort $WebPort 120
    } elseif ($prev -and $prev -ne $release) { Set-Content "$AppDir\previous.txt" $prev }

    # Bersihkan versi & deps lama
    $active = Split-Path ((Get-Item "$AppDir\current").Target | Select-Object -First 1) -Leaf
    $rels = Get-ChildItem "$AppDir\releases" -Directory | Sort-Object Name -Descending
    $keepRels = @($rels | Select-Object -First $Keep | ForEach-Object Name) + $active + $prev | Where-Object { $_ } | Select-Object -Unique
    $rels | Where-Object { $keepRels -notcontains $_.Name } | ForEach-Object { RmTree $_.FullName }
    $usedDeps = @(Get-ChildItem "$AppDir\releases" -Directory | ForEach-Object {
      $t = (Get-Item "$($_.FullName)\apps\api\node_modules" -ErrorAction SilentlyContinue).Target | Select-Object -First 1
      if ($t) { ($t -replace '\\apps\\api\\node_modules$', '') | Split-Path -Leaf } })
    Get-ChildItem "$AppDir\deps" -Directory | Where-Object { $usedDeps -notcontains $_.Name } | ForEach-Object { RmTree $_.FullName }

    $tail = { param($n) if (Test-Path "$AppDir\logs\$n.log") { (Get-Content "$AppDir\logs\$n.log" -Tail 25) -join "`n" } }
    [pscustomobject]@{ Api = $h.Api; Web = $h.Web; Body = $h.ApiBody; RolledBack = $rolledBack; Prev = $prev
      AfterRollback = if ($rolledBack) { "$($h2.Api)/$($h2.Web)" } else { "" }; ApiLog = (& $tail "api"); WebLog = (& $tail "web") }
  }

  Step "Selesai"
  if ($result.RolledBack) {
    Write-Host "--- api.log ---"; Write-Host $result.ApiLog; Write-Host "--- web.log ---"; Write-Host $result.WebLog
    Fail "Versi $release gagal start; server dikembalikan ke $($result.Prev) (API/Web: $($result.AfterRollback))."
  }
  if (-not ($result.Api -and $result.Web)) {
    Write-Host "--- api.log ---"; Write-Host $result.ApiLog; Write-Host "--- web.log ---"; Write-Host $result.WebLog
    Fail "Aplikasi belum sehat (API=$($result.Api), Web=$($result.Web)). Cek log di atas atau jalankan dengan -Status."
  }
  Ok "API health: $($result.Body)"
  Ok "Versi $release aktif - buka $PublicUrl"
  Write-Host ""
  Write-Host "  Login memakai user staging (password bcrypt, mis. admin). Data dari production, HANYA BACA."
  Write-Host ("  Waktu total: {0:mm\:ss}" -f $sw.Elapsed)
}
finally {
  if ($s) { Remove-PSSession $s }
}
