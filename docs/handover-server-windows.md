# Handover operasional Sinobisnis di Windows VM

Dokumen ini merangkum kondisi yang **pernah terverifikasi lewat output operator** sampai 27 November 2026 dan cara menjalankan pembaruan rutin. Server tidak diakses langsung lewat SSH; operator menjalankan PowerShell sebagai Administrator melalui RealVNC. Untuk kondisi terkini, jalankan pemeriksaan pada bagian akhir sebelum mengubah layanan.

## Ringkasan sistem yang berjalan

| Komponen | Lokasi / alamat | Kondisi yang diketahui |
|---|---|---|
| VM aplikasi dan database production | `10.10.3.23` | Windows, XAMPP MariaDB/MySQL lokal di port 3306 |
| Repository di VM | `C:\apps\sinobisnis` | Git checkout branch `main`, remote `https://github.com/leinadroy/sinobisnis.git` |
| API NestJS | `C:\apps\sinobisnis\apps\api`, `localhost:4000` | Scheduled Task `SinobisnisAPI`, menjalankan `node dist\main.js` |
| Web Next.js HTTP | `C:\apps\sinobisnis\apps\web`, port 3001 | Scheduled Task `SinobisnisWeb` |
| Web Next.js HTTPS | Port 8443 | Scheduled Task `SinobisnisHTTPS`, menjalankan `node server-https.cjs` |
| Situs pengguna | `https://smlgroupid.com` | Login dan cetak PDF pernah berhasil melalui alamat ini |
| Reminder otomatis | `Expired Reminder Sinobisnis` | Scheduled Task harian pukul 07.00 WIB, memanggil `scripts\manual\run-reminder-schedule.bat` |
| Apache XAMPP | Port 80/443 pada VM | Service `Apache2.4` pernah teramati berjalan; konfigurasi lokalnya adalah situs XAMPP lama, bukan reverse proxy Sinobisnis yang sudah dibuktikan |
| Tomcat lama | Service `Tomcat9` | Terakhir teramati berhenti; masih terpasang sehingga aplikasi lama dapat dihidupkan kembali bila diperlukan |

Alamat publik `smlgroupid.com` pernah mengarah ke IP publik `202.59.166.133`. Jalur gateway/NAT dari alamat publik ke port 8443 **belum didokumentasikan atau diverifikasi dari perangkat gateway**. Jangan menganggap konfigurasi Apache lokal sebagai konfigurasi TLS situs publik. Dari VM dan PC operator, koneksi langsung ke `https://smlgroupid.com` pernah gagal walaupun akses pengguna ke situs berhasil pada pengujian lain; uji dari jaringan pengguna yang sebenarnya.

## Folder penting di VM

| Path | Fungsi |
|---|---|
| `C:\apps\sinobisnis` | Source code, build, dan script operasional |
| `C:\apps\sinobisnis\apps\api\.env` | Konfigurasi API dan database; **tidak ada di Git** |
| `C:\apps\sinobisnis\apps\api\config\db-profile.json` | Pilihan profil database aktif yang tersimpan; **tidak ada di Git** |
| `C:\apps\sinobisnis\apps\web\.env.local` | Konfigurasi web; **tidak ada di Git** |
| `C:\apps\sinobisnis\apps\api\dist` | Build API |
| `C:\apps\sinobisnis\apps\web\.next` | Build web |
| `C:\apps\sinobisnis\packages\shared\dist` | Build paket bersama |
| `C:\apps\sinobisnis\scripts\manual` | Script cutover dan update yang dipakai di VM |
| `C:\SinobisnisBackups` | Dump database, checksum, salinan konfigurasi, dan backup build dari update |
| `C:\Cert\sino.jks` | Keystore asal sertifikat domain yang dahulu dipakai Tomcat |
| `C:\Cert\sinobisnis-8443\fullchain.pem` | Sertifikat untuk task HTTPS baru |
| `C:\Cert\sinobisnis-8443\private.key` | Private key task HTTPS baru; batasi akses ke Administrator dan SYSTEM |
| `C:\xampp\mysql\bin` | MariaDB/MySQL dan utilitas dump |

Sertifikat dalam `C:\Cert\sino.jks` untuk `smlgroupid.com`/`www.smlgroupid.com` pernah diverifikasi berlaku sampai **6 Mei 2027**. Proses perpanjangan sertifikat dan pembaruan file PEM **belum diotomatisasi**. Jangan menaruh isi `.env`, private key, atau password ke Git/dokumen handover.

## Database dan konfigurasi aplikasi

- Database production: `sinobisnis` pada `10.10.3.23:3306`. Server aplikasi berada di VM yang sama. Setelah cutover, API dilaporkan memakai profil `production` dengan **write diizinkan**. Profil aktif tersimpan di `apps\api\config\db-profile.json`.
- Database staging: `sinobisnis_staging` pada `10.10.3.62:3306`, digunakan selama uji awal. Data staging bisa berbeda dari production.
- Login, user, role, dan hak akses production memakai database production setelah cutover. Fitur Developer → Database pernah dibatasi ke Developer; operator menyatakan hanya tes koneksi yang tersedia dan aman. Periksa lagi sebelum mengubah profil.
- `REMINDER_SCHEDULER=off` pada API VM: penjadwal internal tidak mengirim email agar tidak duplikat. Scheduled Task Windows menjalankan endpoint reminder sekali setiap pagi.
- Konfigurasi web HTTPS mengaktifkan secure cookie dan origin publik `https://smlgroupid.com` melalui `apps\web\server-https.cjs`. API biasanya diakses web secara lokal lewat `http://localhost:4000/api`.
- PDF invoice dibuat oleh Next.js dengan Chrome/Edge headless, lalu lampiran digabung oleh kode aplikasi baru; alur ini tidak memakai PHP.

**Periksa nama profil dan host tanpa menampilkan password:**

```powershell
$root = 'C:\apps\sinobisnis'
Select-String -Path "$root\apps\api\.env" -Pattern '^(DB_PROFILES|DB_PROFILE_DEFAULT|DB_READONLY_PRODUCTION|REMINDER_SCHEDULER|HOST|PORT)='
Get-Content "$root\apps\api\config\db-profile.json"
```

Jangan tampilkan seluruh `.env` di tiket, chat, atau rekaman layar: URL database di dalamnya dapat berisi password.

## Cara kode sampai ke VM

Tidak ada jalur SSH yang dipakai. Developer dan rekan kerja mengirim perubahan ke GitHub. Setelah perubahan **sudah masuk `main`**, operator membuka PowerShell Administrator lewat RealVNC pada VM dan menjalankan script update. Push ke branch lain saja tidak akan terpasang. Perintah `git pull` saja juga tidak cukup: aplikasi production memakai hasil build dan task yang sedang berjalan.

Untuk instalasi awal pada VM baru, siapkan Node.js, npm, Git, Chrome/Edge untuk PDF, koneksi database, sertifikat TLS, dan Scheduled Task. Pada VM ini pernah teramati Node `v26.13.1` dan npm `11.20.0`. Clone repository ke `C:\apps\sinobisnis`, pasang file `.env` secara aman, build paket shared/API/web, lalu buat tiga task layanan dan task reminder. Detail script setup awal ada di `scripts\manual\switch-to-scheduled-tasks.ps1`, `activate-production.ps1`, dan `setup-https-8443.ps1`; beberapa script itu mempunyai **prasyarat kondisi cutover lama dan bukan installer yang aman untuk dijalankan ulang**. Gunakan sebagai referensi dan cek setiap prasyarat pada VM baru. Panduan lama `docs\deploy-windows.md` menggambarkan rancangan IIS/NSSM dan fase database read-only; **bukan topologi VM production yang sekarang**. `scripts\deploy` dan `docs\deploy-docker.md` juga tidak dipakai untuk update VM ini.

## Update rutin dari `main`

Jalankan satu kali di **PowerShell Administrator** pada VM, saat jeda layanan beberapa menit dapat diterima:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\apps\sinobisnis\scripts\manual\update-latest.ps1
```

Script tersebut memeriksa branch `main` dan perubahan file Git lokal, mengambil `origin/main` secara fast-forward, menyimpan build dan dependensi lama di `C:\SinobisnisBackups\update-latest-<waktu>`, menghentikan tiga task layanan, menjalankan `npm ci --include=dev` serta build shared/API/web, menyalakan task kembali, lalu memeriksa API, login HTTPS, redirect logout, dan endpoint pemeriksaan reminder. **Pemeriksaan reminder tidak mengirim email.** Task reminder dikonfigurasi untuk pukul 07.00.

Indikator sukses di output:

```text
Selesai: commit <hash>, Next.js <versi>, API dan web sehat.
```

Jangan jalankan dua update bersamaan. Selama build, API/web 4000/3001/8443 dihentikan, sehingga ada **downtime**. `npm ci` memasang ulang ratusan paket dan build Next.js dapat memakan beberapa menit. Peringatan `npm warn deprecated` dan pemberitahuan versi npm baru bukan kegagalan. Jika script gagal, ia berusaha mengembalikan build/dependensi lama dan menyalakan task kembali; **Git HEAD tetap bisa menunjuk commit baru**. Periksa kesehatan layanan setelah kegagalan sebelum mencoba ulang. Backup script ini **bukan backup database**.

Jika ada perubahan lokal pada file yang dilacak Git, script berhenti sebelum mengubah layanan. Jangan hapus atau reset perubahan itu tanpa memeriksa pemiliknya:

```powershell
git -C C:\apps\sinobisnis status --short
```

File untracked seperti `logs/`, `-Action`, atau `-LogonType` pernah muncul di VM; script terbaru membolehkan untracked selama tidak menghalangi Git merge. Jangan menyalin baris prompt `PS C:\...>` ketika menjalankan perintah dari chat.

## Pemeriksaan setelah update

```powershell
git -C C:\apps\sinobisnis log -1 --oneline
Get-ScheduledTask -TaskName SinobisnisAPI,SinobisnisWeb,SinobisnisHTTPS,'Expired Reminder Sinobisnis' |
  Select-Object TaskName,State
Get-NetTCPConnection -State Listen -LocalPort 3001,4000,8443 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,OwningProcess
Invoke-RestMethod http://localhost:4000/api/health
curl.exe -I --max-time 10 --resolve smlgroupid.com:8443:127.0.0.1 https://smlgroupid.com:8443/login
Get-ScheduledTaskInfo -TaskName 'Expired Reminder Sinobisnis' |
  Select-Object NextRunTime,LastRunTime,LastTaskResult
```

Uji dari browser pengguna: login, pindah menu Profile/Clients/Invoices/Reminders tanpa login ulang, cetak invoice dan PDF dengan lampiran, lalu logout. Periksa label database menunjukkan Production. Untuk pemeriksaan reminder **tanpa mengirim email**:

```powershell
& 'C:\apps\sinobisnis\scripts\manual\run-reminder-schedule.bat' --check
```

Menjalankan BAT yang sama **tanpa `--check` mengirim reminder sungguhan**. Endpoint lokalnya `http://localhost:4000/api/reminders/run-schedule`; method POST dengan header khusus ada di BAT. Jangan memakai URL Tomcat lama `http://localhost:8080/sinobisnis/run-schedule`.

## Backup dan pemulihan

- Backup final sebelum cutover pernah dibuat pada **16 November 2026**: `C:\SinobisnisBackups\sinobisnis-final-20261116-184340.sql`, ukuran 21,14 GiB, dengan file `.sha256`. SHA-256 yang dilaporkan: `380C19AFAFB1B9B9ACEE843B54F49886E7B67AA46C53B36A8A5C994A146D9A92`. Itu adalah **snapshot historis**, bukan backup data terkini. Restore belum pernah diuji dalam percakapan ini. Operator berencana menyalin backup ke luar VM sendiri; penyelesaian salinan tersebut belum dikonfirmasi.
- Script backup database: `scripts\manual\backup-production.ps1`. `-PreflightOnly` menguji dump skema; `-Mode Trial` membuat dump percobaan; `-Mode Final -InputStopped` mensyaratkan input aplikasi sudah dihentikan. Script meminta password lewat prompt, menulis checksum, dan memerlukan ruang kosong minimal 40 GiB. Durasi dump 21,14 GiB saat cutover sekitar 3–4 menit, tetapi ukuran/durasi sekarang perlu diukur ulang.
- Backup konfigurasi Apache pernah dibuat di `C:\SinobisnisBackups\apache-frontdoor-20261116-214641`. Backup SSL/Tomcat dan konfigurasi API juga ada di folder backup bertanggal. Jangan menghapus backup sebelum lokasi, isi, dan kebutuhan restore jelas.
- Jika update gagal, lihat pesan `Pembaruan gagal; build/dependensi lama dipulihkan`, jalankan pemeriksaan kesehatan di atas, dan baca folder `update-latest-<waktu>` yang dicetak script. Pemulihan otomatis mencakup build/dependensi dan task, **bukan rollback data database**. Pemulihan manual atau rollback Git perlu direncanakan sesuai error yang muncul.
- Tomcat lama tetap terpasang dan pernah dibiarkan berhenti agar bisa diluncurkan lagi bila diperlukan. Menghidupkannya berpotensi mengaktifkan aplikasi/reminder lama; periksa port, task, dan alur input sebelum melakukan itu.

## Hal yang masih perlu diverifikasi penerus tugas

1. **Commit terpasang:** output update terakhir yang diterima menyatakan `5d938ef` aktif pada 24 November 2026. Commit `8278406` (perapian garis kanan cetak SML) sudah dikirim ke `main`, tetapi output instalasinya di VM belum diterima.
2. **Hapus invoice 2411:** transaksi hapus pernah menghasilkan `Internal server error`. Pada saat dicek invoice masih ada, status `DRAFT`, tanpa lampiran, dua baris pajak, dan tanpa print queue. Perbaikan `5d938ef` sudah terpasang, tetapi hasil uji ulang tombol hapus belum dilaporkan.
3. **Log API:** Scheduled Task `SinobisnisAPI` menjalankan `node.exe dist\main.js` langsung tanpa pengalihan stdout/stderr; `C:\apps\sinobisnis\logs\api.log` tidak ada pada pemeriksaan 24 November. Untuk error production berikutnya perlu menambahkan pencatatan log yang persisten sebelum diagnosa mendalam.
4. **Gateway publik:** siapa yang mengelola routing `smlgroupid.com:443` ke layanan 8443, pengaturan NAT/firewall, dan cara rollback routing belum terdokumentasi.
5. **Backup terkini dan sertifikat:** tentukan jadwal backup production, uji restore ke lingkungan terpisah, pastikan salinan di luar VM, dan rencanakan perpanjangan sertifikat sebelum 6 Mei 2027.

Dokumen ini tidak memuat password, token, atau private key. Simpan akses rahasia melalui pengelola kredensial organisasi dan serahkan aksesnya secara terpisah kepada operator pengganti.
