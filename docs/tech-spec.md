# Spesifikasi Teknis — Aplikasi Sinobisnis

| | |
|---|---|
| Versi dokumen | 1.0 (6 November 2026) |
| Aplikasi | Sinobisnis (`apps/api` + `apps/web` + `packages/shared`) |
| Database | MySQL-compatible: **MariaDB 10.4** (production) / **MySQL 8.0** (staging), struktur `sinobisnis` |
| Status | Pengganti total aplikasi GeneXus; uji coba production hanya-baca (Fase A) |

Dokumen terkait: [tech-stack.md](tech-stack.md) (standar & konvensi), [apps/api/README.md](../apps/api/README.md)
(setup, endpoint, aturan bisnis lengkap), [invoice-mapping.md](invoice-mapping.md), [deploy-windows.md](deploy-windows.md),
[deploy-docker.md](deploy-docker.md).

---

## 1. Tujuan & ruang lingkup

Sinobisnis adalah aplikasi internal SML Group untuk mengelola data client visa/TKA, kontrak harga, invoice (termasuk
cetak & PDF dengan lampiran), dan email reminder. Aplikasi ini **menggantikan aplikasi GeneXus** yang berjalan di
https://smlgroupid.com/sinobisnis, **di atas database MySQL/MariaDB yang sama** tanpa mengubah strukturnya.

Di dalam ruang lingkup:

- Login, user, role, dan hak akses per menu.
- Master data: Sponsor, Sponsor Project, Bill To, Keperluan, Company, Bank Account, Tax, Email Template, Email Recipient.
- Client (Data Client Visa, arsip, Client List, log, lampiran, conversation, export CSV).
- Kontrak & daftar harga, Create Invoice, Invoice List, Update Request, cetak invoice (SML/RTS/JCSS), PDF + lampiran.
- Email Reminder terjadwal, System Configurator, pemilihan profil database.

Di luar ruang lingkup: perubahan struktur database, kompatibilitas berjalan berdampingan dengan GeneXus untuk *penulisan*
(GeneXus dimatikan saat go-live), aplikasi `apps/invoice-printer` dan `apps/invoice-web` (Python, terpisah).

## 2. Arsitektur

```
Browser (staf)
   │  HTTPS
   ▼
Reverse proxy (IIS + URL Rewrite/ARR, atau Nginx/Caddy di Docker)
   │
   ▼
apps/web — Next.js 16 (port 3001)
   ├─ Server Components / Server Actions ── lib/api.ts ──┐
   ├─ Route handler /bff/* (upload, download, export, PDF)┤  REST JSON + Bearer JWT
   └─ Chrome/Edge headless (puppeteer-core) untuk PDF    │
                                                          ▼
                                   apps/api — NestJS 12 (port 4000, prefix /api)
                                      ├─ Guard global: JWT + hak akses menu + ReadOnlyGuard
                                      ├─ Prisma 7.10.1 + @prisma/adapter-mariadb (pool per profil DB)
                                      └─ Penjadwal reminder (croner) + SMTP (nodemailer)
                                                          │  protokol MySQL (3306)
                                                          ▼
                                   MySQL / MariaDB — database `sinobisnis` (struktur GeneXus)
```

Prinsip:

- **Web tidak pernah mengakses database.** Semua data lewat API; JWT disimpan di cookie httpOnly `sml_token` dan diteruskan
  sebagai `Authorization: Bearer`.
- API hanya mendengarkan `127.0.0.1` di server (`HOST`), sehingga browser selalu lewat web/BFF.
- `packages/shared` (ESM) berisi type, menu, matriks hak akses default, definisi master data, dan aturan bisnis murni
  (hitung invoice, terbilang, format nomor, expired dokumen) yang dipakai API dan web.

## 3. Teknologi & versi

| Komponen | Teknologi | Versi |
|---|---|---|
| Runtime | Node.js | 22.x (diuji 22.15.0), npm dengan `legacy-peer-deps=true` |
| Bahasa | TypeScript | API 6.x, web/shared 5.x |
| API | NestJS (`@nestjs/*`), Swagger | 12.x |
| ORM | Prisma Client (generator `prisma-client`, ESM) | **7.10.1 (dikunci)** |
| Driver DB | `@prisma/adapter-mariadb` (driver `mariadb`, protokol MySQL) | **7.10.1 (dikunci)** |
| Validasi | class-validator + class-transformer (`ValidationPipe` global, whitelist) | 0.15 / 0.5 |
| Auth | `@nestjs/jwt`, bcryptjs | 12.x / 3.x |
| Penjadwal & email | croner, nodemailer | **10.0.1 / 10.1.7 (dikunci)** |
| Web | Next.js (App Router, Turbopack), React | 16.4.3 / 19.3.0 |
| UI | Tailwind CSS 4, shadcn/ui (base-nova, `@base-ui/react`), lucide-react, sonner | — |
| Tabel | TanStack Table | 8.x |
| Form | react-hook-form + zod | 7.x / 4.x |
| PDF | puppeteer-core + Chrome/Edge sistem, pdf-lib | 25.14.0 / 1.17.1 |
| Test | Vitest (API) | 4.x |

## 4. Database (MySQL / MariaDB)

### 4.1 Server & profil

| Profil | Server | Engine | Database | Akses |
|---|---|---|---|---|
| `local` | laptop developer (XAMPP) | MariaDB | `sinobisnis` | baca/tulis (salinan production, blob kosong) |
| `staging` | 10.10.3.62 | **MySQL 8.0.31** | `sinobisnis_staging` | baca/tulis (salinan production lengkap, lampiran sebagian) |
| `production` | 10.10.3.23 (butuh VPN) | **MariaDB 10.4** | `sinobisnis` | **hanya baca** sampai go-live |

Profil dipilih saat berjalan lewat *Developer Menu → Database* (khusus role Developer). Koneksi hanya ada di
`apps/api/.env` (`DB_PROFILES`, `DB_URL_<PROFIL>`, `DB_DATABASE_<PROFIL>`, `DB_READONLY_<PROFIL>`, `DB_AUTH_<PROFIL>`,
`DB_ENV_FILE`); pilihan aktif di `apps/api/config/db-profile.json`. Pindah profil menguji koneksi + 30 tabel dulu,
membatalkan semua JWT (token membawa nama profil), lalu dicatat di `datalog` (TableName `Database`).

### 4.2 Kompatibilitas MySQL

- `schema.prisma` memakai `provider = "mysql"`; URL koneksi berformat `mysql://user:pass@host:3306/db` (password di-URL-encode).
  Adapter mengubahnya ke `mariadb://` untuk driver. Driver `mariadb` berbicara protokol MySQL, sehingga **MariaDB 10.4 dan
  MySQL 8.0 sama-sama berjalan tanpa perubahan kode** (sudah dipakai di staging MySQL 8).
- Hanya fitur SQL umum yang dipakai (tanpa JSON column, CTE rekursif, atau fungsi khusus satu engine). Kunci baris memakai
  `SELECT … FOR UPDATE` di dalam transaksi InnoDB.
- Collation `utf8_general_ci` sudah tidak peka huruf besar/kecil; pencarian memakai `contains` biasa.
- **Batasan MySQL:** pengaman profil hanya-baca memakai `SET SESSION max_statement_time`, yang hanya ada di MariaDB. Di
  MySQL padanannya `max_execution_time` (milidetik, hanya untuk SELECT). Karena itu profil hanya-baca saat ini hanya
  didukung untuk server MariaDB; bila production pindah ke MySQL, `READ_ONLY_INIT_SQL` di
  `apps/api/src/prisma/adapter.ts` harus disesuaikan.
- DATETIME disimpan dalam **UTC** (sama dengan aplikasi lama dan adapter). Kolom DATE dibaca/ditulis sebagai tanggal murni
  (`s2d`/`d2s`); "hari ini" = tanggal lokal server (`todayStr()`).

### 4.3 Aturan struktur

- **Struktur database tidak boleh diubah.** Tidak ada `prisma migrate`; `prisma migrate diff` antara database dan
  `schema.prisma` harus kosong. Model/field di-rename hanya di sisi Prisma (`@@map`/`@map`).
- Konvensi data GeneXus dipertahankan: tanggal kosong `1000-01-01` (API mengirim `null`), teks kosong `''`, id `0` = tidak
  dipilih, baris placeholder "== Please Select ==" disembunyikan.
- Client ↔ invoice hanya lewat teks `client.ClientNoInvoice`; `invoice.InvoiceNo` tidak unik (ada nomor ganda lama).
- `client.ClientNo`, `invoice.InvoiceId`, nilai uang (`BIGINT`) dikirim sebagai number lewat `SerializeInterceptor`.

### 4.4 Tabel (30)

| Kelompok | Tabel |
|---|---|
| Security | `users`, `role`, `rolepgmname`, `menuitem`, `usercookies` |
| Master | `sponsor`, `sponsorproject`, `billto`, `keperluan`, `bankaccount`, `company`, `tax` |
| Client | `client`, `attachment`, `conversation`, `notification` |
| Invoice | `invoice`, `invoicedetail`, `invoicetax`, `invoiceattachment`, `updaterequest`, `printqueue` |
| Kontrak | `kontrak`, `kontrakdetail` |
| Email & sistem | `emailtemplate`, `emailrecipient`, `systemconfigurator`, `systemmessages`, `datalog`, `action` |

Catatan volume: `attachment` (~7,7 GB) dan `invoiceattachment` (~2,3 GB) menyimpan file sebagai BLOB. Query ke dua tabel ini
selalu memilih kolom non-blob dan memakai WHERE/LIMIT; blob hanya dibaca per file saat diunduh atau digabung ke PDF.

### 4.5 Keamanan database

- Profil hanya-baca dikunci di tiga lapis: tiap koneksi pool menjalankan `SET SESSION TRANSACTION READ ONLY` +
  `max_statement_time = 120` (pool maks. 5 koneksi, connect timeout 10 dtk); `ReadOnlyGuard` global menolak semua request
  selain GET/HEAD/OPTIONS (kecuali endpoint `@AllowOnReadOnly()`: login, ganti password/profil, tes & pindah database); reminder dan
  sinkron `menuitem` dimatikan. Login dan hak akses dibaca dari profil tulis (`DB_AUTH_PRODUCTION=local`).
- User `gxmysql` punya ALL PRIVILEGES di server. Untuk go-live wajib dibuat user database khusus dengan hak terbatas pada
  database `sinobisnis` saja.
- Akses manual ke production dari project ini hanya lewat `tools/db.py` (satu SELECT/SHOW/DESCRIBE/EXPLAIN/WITH per
  panggilan, sesi READ ONLY).

## 5. Modul fungsional

| Modul (API `src/…`) | Halaman web | Tabel utama |
|---|---|---|
| `auth`, `users`, `roles` | `/login`, `/security/*`, `/account/*` | `users`, `role`, `rolepgmname`, `menuitem` |
| `master` (generik dari `MASTER_ENTITIES`) | `/master/[entity]` | tabel master + `emailtemplate`, `emailrecipient` |
| `clients` | `/clients`, `/clients/archived`, `/clients/people`, `/clients/log` | `client`, `attachment`, `conversation`, `datalog` |
| `kontrak` | `/kontrak` | `kontrak`, `kontrakdetail` |
| `invoices` | `/invoices`, `/invoices/create`, `/invoices/requests`, `/print/invoices/[id]` | `invoice*`, `updaterequest` |
| `reminders` | `/reminders`, `/developer/system-config` | `keperluan`, `client`, `emailtemplate`, `emailrecipient`, `systemconfigurator`, `datalog` |
| `database` | `/developer/database` | — (profil) |

Aturan bisnis penting (detail di README API):

- **Invoice:** `invoicedetail` Qty > 0 = layanan, Qty 0 (atau harga 0 bernomor) = nama TKA; grup dibentuk dari urutan baris.
  Nomor = `CompanyInvoiceLastNo + 1` dengan token GeneXus (`@YY@`, `@YYYY@`, `@ROM@`, `@MM@`, `@autonumber@`), baris company
  dikunci `FOR UPDATE` dalam transaksi yang sama. Simpan header + grup + item + pajak dalam satu transaksi.
- **Update Request:** invoice FINAL/PAID hanya bisa diedit sekali setelah disetujui (APPROVED → DONE).
- **Cetak & PDF:** layout dipilih dari awalan nomor (SML/RTS/JCSS). PDF dirender Chrome/Edge headless dari halaman cetak
  dengan sesi user; `?attachments=1` menggabungkan lampiran PDF/JPG/PNG ber-bookmark.
- **Reminder:** per Keperluan, hanya client yang tepat jatuh di hari ke-N (0 = nonaktif), satu email per kategori per
  Keperluan per hari, log di `datalog` (TableName `Reminder`). Jadwal dari System Configurator (`Reminder Enabled`,
  `Reminder Cron` default `0 7 * * *`, `Reminder Timezone` default `Asia/Jakarta`).
- **Audit:** setiap insert/update/delete/arsip/lampiran client dicatat di `datalog` dengan snapshot JSON.

## 6. Antarmuka API

- Base path `/api`, dokumentasi Swagger di `/api/docs`.
- Semua endpoint butuh Bearer JWT kecuali `@Public()` (login). Hak akses `@Menu(key)`: GET butuh **Lihat**, selain GET butuh
  **Edit**, dari `rolepgmname` per `MenuItemId`. Role Developer selalu akses penuh.
- List: query `page`, `pageSize`, `sort`, `order`, `search` + filter; respons `{ data, total, page, pageSize }`.
- Validasi: `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })`; pesan error dalam Bahasa Indonesia.
- Upload: multipart field `files`, maks. 20 file × 20 MB per request, disimpan sebagai BLOB.
- Export CSV maks. 50.000 baris.

Daftar endpoint lengkap: [apps/api/README.md § Endpoint](../apps/api/README.md#endpoint).

## 7. Keamanan aplikasi

- **Password:** bcrypt (`UsersSalt = 'bcrypt'`). Hash GeneXus lama tidak bisa diverifikasi; password diatur ulang lewat
  Security → Users atau `npm run user:password -- <username>`.
- **Sesi:** JWT (`JWT_SECRET`, `JWT_EXPIRES_IN` default 12h) berisi `sub` (UsersId) + `db` (profil). Disimpan di cookie
  httpOnly `sml_token` (`SameSite=Lax`), `Secure` di build production kecuali `COOKIE_SECURE=0` (uji coba lewat http). Pindah profil database membatalkan
  semua token.
- **Jaringan:** API hanya di `127.0.0.1`; CORS dibatasi ke `WEB_ORIGIN`; HTTPS diterminasi di reverse proxy.
- **Rahasia:** semua kredensial di file `.env` (tidak di-commit; Docker me-mount read-only, tidak dimasukkan ke image).
  Nilai rahasia System Configurator (`SMTP Password`, key berisi password/secret/token/salt) tidak pernah dikirim ke web.

## 8. Konfigurasi

| File | Isi utama |
|---|---|
| `.env` (root) | `DB_*` production (dirujuk lewat `DB_ENV_FILE`), `LOCAL_DB_*`, `STAGING_DB_*` untuk tool clone |
| `apps/api/.env` | `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT`, `HOST`, `WEB_ORIGIN`, `REMINDER_SCHEDULER`, `DB_PROFILES` + `DB_*_<PROFIL>` |
| `apps/web/.env` | `API_URL`, `PDF_BROWSER_PATH`, `PDF_RENDER_ORIGIN`, `COOKIE_SECURE` |
| `apps/api/config/db-profile.json` | Profil aktif (git-ignored) + `db-switch.log` |

Prisma CLI dan `npm run user:password` selalu memakai `DATABASE_URL`, bukan profil aktif.

## 9. Deployment

| Opsi | Ringkas | Panduan |
|---|---|---|
| Windows Server | IIS (URL Rewrite + ARR) → Next 127.0.0.1:3001 → API 127.0.0.1:4000, keduanya service NSSM; skrip `scripts/deploy/` (`setup-server.ps1`, `install-services.ps1`, `update.ps1`) | [deploy-windows.md](deploy-windows.md) |
| Docker (Linux) | `docker-compose.yml`, `Dockerfile.api`, `Dockerfile.web` (dengan Chromium); database tetap eksternal | [deploy-docker.md](deploy-docker.md) |

Kebutuhan server: Node.js 22, Chrome/Edge/Chromium untuk PDF, akses jaringan ke server MySQL/MariaDB (port 3306), SMTP
untuk reminder.

Tahapan:

1. **Fase A (uji coba):** profil `production` hanya-baca, login dari database lokal, reminder tetap dikirim aplikasi lama
   (`Reminder Enabled` = 0).
2. **Fase B (go-live):** aplikasi GeneXus dimatikan; buat user database khusus, set `DB_READONLY_PRODUCTION=0`, atur password
   user di production, lalu putuskan `Reminder Enabled`.

## 10. Kebutuhan non-fungsional

| Aspek | Ketentuan |
|---|---|
| Performa | Paging, sort, dan filter dilakukan di server; query baca paralel (`Promise.all`); query tunggal di profil hanya-baca dibatasi 120 detik |
| Konsistensi | Penulisan yang harus atomik memakai `prisma.$transaction`; nomor invoice dikunci `FOR UPDATE` |
| Ketersediaan | Satu instance API menjalankan penjadwal; instance tambahan memakai `REMINDER_SCHEDULER=off` |
| Audit | `datalog` untuk client, reminder, dan perpindahan database |
| Responsif | Semua list punya tampilan kartu untuk ponsel (`renderCard` di `DataTable`) |
| Bahasa | UI dan pesan error Bahasa Indonesia; label menu mengikuti aplikasi lama |

## 11. Pengembangan & pengujian

```bash
npm run install:all   # shared + api + web
npm run dev:api       # http://localhost:4000/api
npm run dev:web       # http://localhost:3001
npm run build         # shared → api → web (hentikan dev server dulu)
```

- Database lokal dibuat dengan `python tools/migrate/clone_production.py all --replace` (membaca production hanya lewat
  `tools/db.py`); staging dengan `--target staging`.
- Unit test (`npm test` di `apps/api`): perhitungan invoice, baris invoice ↔ grup, aturan & log reminder, tanggal.
- Uji end-to-end hanya terhadap database lokal/staging, **tidak pernah terhadap production**. Database lokal berisi
  pengaturan SMTP production asli; arahkan `SMTP Host` ke server SMTP palsu sebelum menguji kirim reminder.
- Setelah `git pull` yang mengubah `package.json`, jalankan `npm install` di folder app terkait (dependency yang hilang,
  mis. `puppeteer-core`, membuat fitur PDF gagal).
