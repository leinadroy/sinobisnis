# Deploy aplikasi Sinobisnis ke Windows Server

Panduan memasang `apps/api` (NestJS) + `apps/web` (Next.js) di server kantor Windows. Build production sudah dicoba di
laptop development (2026-11-04): halaman, data, dan PDF invoice berjalan normal.

```
Browser ──HTTPS──> IIS (443, reverse proxy) ──> Web Next.js 127.0.0.1:3001 ──> API NestJS 127.0.0.1:4000 ──> MariaDB
                                                      │ (PDF: Chrome/Edge headless)                         10.10.3.23
```

Browser hanya bicara dengan IIS. Port 3001 dan 4000 cukup terbuka untuk server itu sendiri.

Deploy dilakukan dalam dua fase:

- **Fase A — uji coba:** aplikasi baru membaca data production **hanya baca** (profil `production`, lihat
  `apps/api/README.md`). Aplikasi lama tetap dipakai seperti biasa.
- **Fase B — go-live:** aplikasi lama dimatikan, aplikasi baru menulis ke production.

**Cara cepat (Fase A):** setelah software di langkah 1 terpasang dan user `sinobisnis_ro` dibuat (langkah 2), jalankan
`scripts\deploy\setup-server.ps1` sebagai Administrator. Script mengerjakan langkah 3–9: ambil kode, membuat kedua `.env`
(password ditanya, `JWT_SECRET` baru), menyalin production ke MariaDB lokal, build, service NSSM, site IIS, dan firewall.
Default `-Domain http://10.10.3.61` untuk uji coba tanpa HTTPS (memakai `scripts\deploy\iis-http` dan `COOKIE_SECURE=0`).
Script boleh dijalankan ulang; `.env` yang sudah ada tidak ditimpa.

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\setup-server.ps1                                   # http://10.10.3.61
.\setup-server.ps1 -Domain https://sinobisnis.x.com  # dengan domain; binding https diatur manual
```

**Deploy langsung port 3001 (tanpa IIS, sama seperti laptop) — dipakai di 10.10.3.23:** di server itu port 80/443
sudah dipakai Apache XAMPP, jadi IIS tidak dipasang. `scripts\deploy\setup-direct.ps1` membuka web langsung di
`http://10.10.3.23:3001` (Next listen `0.0.0.0:3001`, firewall 3001; API tetap `127.0.0.1:4000`) dengan profil yang sama
seperti laptop setelah go-live 2026-11-12: `staging` (default) + `production` **bisa ditulis**; login dari database
profil yang aktif. Tanpa salin data, tanpa MariaDB tambahan, tanpa Python. `REMINDER_SCHEDULER=off` tetap dipasang.
Software yang perlu: Node.js 22, Git, NSSM, Chrome/Edge. Update berikutnya tetap `update.ps1`.

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\setup-direct.ps1          # http://<ip-server>:3001, kode dari branch main
```

**Dipasang di server database production (10.10.3.23) dengan Fase A?** Di sana "MariaDB lokal" (127.0.0.1:3306) adalah production
itu sendiri. Database login Fase A wajib memakai **nama lain**, mis. `sinobisnis_login`, dengan user yang hanya punya hak
pada database itu:

```sql
CREATE USER 'sinobisnis_local'@'localhost' IDENTIFIED BY '<password-kuat>';
GRANT ALL PRIVILEGES ON sinobisnis_login.* TO 'sinobisnis_local'@'localhost';
```

`setup-server.ps1` mendeteksi server ini dan menolak nama `sinobisnis`; `clone_production.py` juga menolak menulis ke
database production walau lewat `localhost`. MariaDB sudah ada, jadi tidak perlu dipasang lagi. Cek juga apakah port 80
sudah dipakai aplikasi lama.

---

## 1. Software di server

| Software | Catatan |
|---|---|
| Node.js 22 LTS (installer `.msi`, x64) | Cek: `node -v` → `v22.x` |
| Git for Windows | Untuk mengambil kode dari GitHub `leinadroy/sinobisnis` |
| Google Chrome atau Microsoft Edge | Wajib untuk PDF invoice. Edge biasanya sudah ada di Windows Server 2019+ |
| NSSM (`nssm.exe`, salin ke `C:\Windows\System32`) | Menjalankan API & web sebagai Windows Service (sama seperti invoice-web) |
| IIS + modul **URL Rewrite** + **Application Request Routing (ARR)** | Reverse proxy & HTTPS |
| MariaDB 10.4 (khusus Fase A) | Database login lokal; lihat langkah 3 |

Atur zona waktu Windows ke **(UTC+07:00) Bangkok, Hanoi, Jakarta**, karena "hari ini" untuk reminder dan tanggal invoice
diambil dari jam server.

Server harus bisa menjangkau `10.10.3.23:3306` (LAN kantor atau VPN yang selalu menyala). Cek dengan:
`Test-NetConnection 10.10.3.23 -Port 3306`

## 2. User database (dikerjakan admin database)

Jangan memakai `gxmysql`, karena user itu punya hak penuh atas server. Ganti `<ip-server-aplikasi>` dan password:

```sql
-- Fase A: hanya baca
CREATE USER 'sinobisnis_ro'@'<ip-server-aplikasi>' IDENTIFIED BY '<password-kuat>';
GRANT SELECT ON sinobisnis.* TO 'sinobisnis_ro'@'<ip-server-aplikasi>';

-- Fase B (hari go-live): baca-tulis data, tanpa hak mengubah struktur
CREATE USER 'sinobisnis_app'@'<ip-server-aplikasi>' IDENTIFIED BY '<password-kuat>';
GRANT SELECT, INSERT, UPDATE, DELETE ON sinobisnis.* TO 'sinobisnis_app'@'<ip-server-aplikasi>';
```

## 3. Database login untuk Fase A

Password user di production masih format GeneXus yang tidak bisa diverifikasi aplikasi baru, dan database hanya-baca
tidak bisa diberi password baru. Karena itu login, user, dan hak akses dibaca dari database lain yang bisa ditulis
(`DB_AUTH_PRODUCTION`).

1. Pasang MariaDB di server aplikasi.
2. Buat user lokal, mis. `sinobisnis_local`, dengan hak penuh pada database `sinobisnis`.
3. Salin production ke sana dengan skrip yang sama seperti di laptop. Production hanya dibaca, tanpa blob lampiran.
   Isi `.env` root dengan `DB_*` = user `sinobisnis_ro` dan `LOCAL_DB_*` = user lokal tadi, lalu:
   ```powershell
   python tools\migrate\clone_production.py all --replace
   ```
4. Setelah API jalan (langkah 7), atur password user yang akan uji coba:
   `npm --prefix apps\api run user:password -- <username>`

## 4. Ambil kode

```powershell
mkdir C:\apps
cd C:\apps
git clone https://github.com/leinadroy/sinobisnis.git sinobisnis
cd sinobisnis
mkdir logs
```

## 5. Konfigurasi

File `.env` tidak ada di GitHub; buat di server. Simpan password hanya di file ini.

**`C:\apps\sinobisnis\apps\api\.env`** (Fase A):

```ini
# Database login lokal (langkah 3) — dipakai juga oleh Prisma CLI & npm run user:password
DATABASE_URL="mysql://sinobisnis_local:<password>@localhost:3306/sinobisnis"

JWT_SECRET="<string acak panjang, BUAT BARU — jangan salin dari laptop>"
JWT_EXPIRES_IN="12h"
PORT=4000
WEB_ORIGIN="https://<domain-aplikasi>"

# Profil database (Developer Menu → Database)
DB_PROFILES=local,production
DB_LABEL_LOCAL=Lokal server
DB_URL_LOCAL=${DATABASE_URL}
DB_LABEL_PRODUCTION=Production
DB_URL_PRODUCTION="mysql://sinobisnis_ro:<password-url-encoded>@10.10.3.23:3306/sinobisnis"
DB_READONLY_PRODUCTION=1
DB_AUTH_PRODUCTION=local
DB_PROFILE_DEFAULT=production

# Reminder dikirim aplikasi lama; jangan kirim dari sini selama Fase A
REMINDER_SCHEDULER=off
```

Karakter khusus di password URL harus di-encode, mis. `@` → `%40`, `#` → `%23`, `:` → `%3A`.

Variabel untuk web (`API_URL`, `PORT`, dll.) diisi di service NSSM pada langkah 7, tidak di file.

## 6. Install & build

```powershell
cd C:\apps\sinobisnis
npm run install:all
npm run build
```

`build` membangun `packages/shared`, API (termasuk Prisma client), dan web. Lama kira-kira 1–3 menit.

## 7. Windows Service (NSSM)

Jalankan PowerShell **sebagai Administrator**:

```powershell
cd C:\apps\sinobisnis
.\scripts\deploy\install-services.ps1 -Domain "https://<domain-aplikasi>"
```

Skrip ini membuat dan menjalankan dua service:

| Service | Perintah | Lingkungan |
|---|---|---|
| `SinobisnisAPI` | `node dist\main.js` di `apps\api` | `NODE_ENV=production`, `HOST=127.0.0.1` |
| `SinobisnisWeb` | `next start -p 3001 -H 127.0.0.1` di `apps\web` | `API_URL=http://127.0.0.1:4000/api`, `PDF_RENDER_ORIGIN=http://127.0.0.1:3001` |

Log ditulis ke `C:\apps\sinobisnis\logs\api.log` dan `web.log`; file diganti baru setiap 10 MB. Kedua service otomatis
jalan saat server menyala. Web baru dijalankan setelah API.

Kalau Chrome/Edge tidak ada di lokasi standar, tambahkan `PDF_BROWSER_PATH`:
`nssm set SinobisnisWeb AppEnvironmentExtra +PDF_BROWSER_PATH=C:\...\chrome.exe`

Cek dari server: `curl.exe http://127.0.0.1:4000/api/health` → `{"status":"ok","database":"ok"}` dan buka `http://127.0.0.1:3001`.

## 8. IIS: domain & HTTPS

1. Pasang **URL Rewrite** dan **ARR**.
2. Aktifkan proxy, pertahankan Host header, dan beri waktu 5 menit (PDF gabungan lampiran bisa lama). Jalankan sebagai
   Administrator:
   ```powershell
   & $env:windir\system32\inetsrv\appcmd.exe set config -section:system.webServer/proxy /enabled:"True" /preserveHostHeader:"True" /timeout:"00:05:00" /commit:apphost
   & $env:windir\system32\inetsrv\appcmd.exe set config -section:system.webServer/rewrite/allowedServerVariables /+"[name='HTTP_X_FORWARDED_PROTO']" /commit:apphost
   ```
3. Buat site baru, mis. `Sinobisnis`, dengan folder fisik `C:\apps\sinobisnis\scripts\deploy\iis`. Folder itu berisi
   `web.config` yang meneruskan semua request ke `http://127.0.0.1:3001` dan mengizinkan upload sampai 400 MB.
4. Binding **https 443** dengan sertifikat domain. Opsional: binding http 80 yang dialihkan ke https.

## 9. Firewall

Hanya buka 443 (dan 80 bila dipakai). Port 3001 dan 4000 tidak perlu dibuka, karena keduanya hanya mendengarkan
`127.0.0.1`.

## 10. Cek setelah deploy

- [ ] `https://<domain>` membuka halaman login; login dengan user yang sudah diberi password (langkah 3.4).
- [ ] Header menampilkan label database yang benar (Fase A: **Production · hanya baca**, pita biru di atas).
- [ ] Developer Menu → Database: tes koneksi production hijau, "sesi READ ONLY".
- [ ] Invoice List & Data Client tampil; cetak invoice SML/RTS/JCSS; **PDF Invoice** dan **PDF + Lampiran** terunduh.
- [ ] Coba simpan sesuatu → pesan "dibuka khusus baca" (Fase A).
- [ ] Restart server → kedua service jalan sendiri.

## 11. Update versi berikutnya

```powershell
cd C:\apps\sinobisnis
.\scripts\deploy\update.ps1
```

Skrip ini menjalankan `git pull`, install, build, lalu restart kedua service (downtime sekitar 1–3 menit). Bila build
gagal, kode otomatis dikembalikan ke versi sebelumnya, dibangun ulang, dan service dinyalakan lagi.

## 12. Hari go-live (Fase B)

1. Umumkan jadwal. **Matikan aplikasi GeneXus**, atau minimal hentikan semua input di sana.
2. **Backup penuh** database `sinobisnis` (oleh admin database).
3. Di `apps\api\.env`:
   - `DB_URL_PRODUCTION` memakai user `sinobisnis_app`
   - `DB_READONLY_PRODUCTION=0`
   - `DATABASE_URL` = URL production yang sama
   - `DB_PROFILES=production`, `DB_PROFILE_DEFAULT=production`
   - hapus `DB_AUTH_PRODUCTION`
4. `nssm restart SinobisnisAPI`, lalu atur password semua user aktif:
   `npm --prefix apps\api run user:password -- <username>` atau Security → Users.
5. Putuskan kapan reminder dikirim dari aplikasi baru: hapus `REMINDER_SCHEDULER=off`, isi System Configurator
   `Reminder Enabled = 1`, lalu restart API. Jangan sampai dua aplikasi mengirim reminder bersamaan.
6. Perbarui aturan "read-only production" di `CLAUDE.md`, karena sejak saat ini aplikasi baru memang menulis ke
   production.

**Kembali ke aplikasi lama bila ada masalah besar:** hentikan `SinobisnisWeb`, nyalakan lagi aplikasi GeneXus, dan
restore backup bila ada data yang rusak. Data yang diinput lewat aplikasi baru memakai tabel yang sama, jadi tetap
terbaca oleh aplikasi lama. Pengecualiannya: user yang passwordnya sudah diganti (bcrypt) tidak bisa login di aplikasi
lama.
