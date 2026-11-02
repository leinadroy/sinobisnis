# Sinobisnis — apps/api (NestJS + Prisma + PostgreSQL)

REST API aplikasi Sinobisnis (pengganti sistem GeneXus). Frontend ada di `apps/web` (Next.js); type, menu,
matriks hak akses, definisi master data, dan aturan bisnis client bersama ada di `packages/shared`.
Standar: [`docs/tech-stack.md`](../../docs/tech-stack.md).

> Database **baru** ini adalah PostgreSQL lokal (`sinobisnis_app`). Database lama `sinobisnis` (MariaDB 10.10.3.23)
> tetap **read-only** dan tidak disentuh oleh API ini.

## Status

| Tahap | Isi | Status |
|---|---|---|
| 1 | Skema Prisma semua modul, login JWT, Users, Role, Hak Akses Role | ✅ |
| 2 | Master data (7 entitas) + Client (list/filter, form, lampiran, arsip, conversation, Client List, log, export CSV) | ✅ |
| 3 | Invoice (Create Invoice, grup → item, pajak, lampiran, export), Update Request (Request To Edit), Kontrak, cetak invoice | ✅ |
| 4 | Email Reminder (5 kategori, kirim manual/paksa, Notification Log) + penjadwal otomatis; Developer Menu: Email Template, Email Recipient, System Configurator | ✅ |
| 5 | Migrasi data dari MariaDB production (read-only) | belum |

## Setup pertama

1. Jalankan service PostgreSQL (`services.msc` → `postgresql-x64-18` → Start).
2. Buat role & database aplikasi. Dua cara:
   - **Dengan script** (tidak butuh psql): dari folder ini jalankan `node scripts/setup-db.mjs`. Script meminta password
     `postgres` (tersembunyi), membuat role + database `sinobisnis_app` dengan password acak, menguji login, lalu menulis
     `DATABASE_URL` ke `.env`. Non-interaktif: set `PG_SUPER_PASSWORD` (opsional `APP_DB_PASSWORD`).
   - **Manual** di `psql` sebagai superuser:
     ```sql
     CREATE USER sinobisnis_app WITH PASSWORD 'isi-password-anda' CREATEDB;
     CREATE DATABASE sinobisnis_app OWNER sinobisnis_app;
     ```
   `CREATEDB` dibutuhkan `prisma migrate dev` untuk *shadow database* (khusus development; tidak perlu di production
   yang memakai `prisma migrate deploy`). Script di atas belum memberi hak ini — jalankan
   `ALTER ROLE sinobisnis_app CREATEDB;` sebagai `postgres`.
3. Salin `.env.example` → `.env` di folder ini; isi `DATABASE_URL` (bila belum diisi script) dan `JWT_SECRET`.
4. Dari akar monorepo:
   ```bash
   npm run install:all   # shared + api + web
   npm run db:migrate    # buat tabel (prisma migrate dev)
   npm run db:seed       # role, matriks hak akses default, admin awal, pajak, keperluan, template email, config
   npm run dev:api       # http://localhost:4000/api  (Swagger: /api/docs)
   npm run dev:web       # http://localhost:3001
   ```

User awal dari seed memakai `ADMIN_USERNAME` / `ADMIN_PASSWORD` di `.env` (role **Developer**). Segera ganti password.

### Variabel `.env`

| Nama | Keterangan |
|---|---|
| `DATABASE_URL` | Koneksi PostgreSQL |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Penandatanganan token login (default 12h) |
| `PORT`, `WEB_ORIGIN` | Port API (4000) & origin web untuk CORS |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Admin awal saat seed (hanya bila belum ada user) |
| `UPLOAD_DIR` | Folder lampiran (default `storage/uploads`, relatif terhadap folder kerja API; di-gitignore) |
| `REMINDER_SCHEDULER` | `off` = matikan penjadwal reminder di instance ini (pakai bila API dijalankan lebih dari satu) |

### Masalah yang diketahui di PC development

Instalasi PostgreSQL 18 kehilangan `libpq.dll`/`libssl`/`libcrypto` di folder `bin`, sehingga service Windows gagal start
(error 1053) dan `psql` crash memakai DLL milik XAMPP. Sementara server dijalankan manual
(`pg_ctl start -D "C:\Program Files\PostgreSQL\18\data"`) dan mati saat restart. Perbaikan: *Repair* lewat installer
PostgreSQL 18.

## Struktur

```
src/
├── main.ts                  # prefix /api, ValidationPipe global, CORS, Swagger
├── app.module.ts            # + SerializeInterceptor global
├── prisma/                  # PrismaService (adapter pg)
├── common/
│   ├── decorators.ts        # @Public, @Menu(key, mode?), @CurrentUser
│   ├── list-query.dto.ts    # page/pageSize/sort/order/search + paginated()
│   ├── serialize.interceptor.ts  # Prisma.Decimal → number di semua response
│   └── validate.ts          # validateBody(): validasi DTO yang dipilih saat runtime
├── auth/                    # login JWT, /auth/me, ganti password/profil, guard global (JWT + hak akses menu)
├── users/                   # CRUD user
├── roles/                   # CRUD role + matriks hak akses (/role-access/:roleId)
├── master/                  # master data generik: config per entitas + DTO class-validator
├── clients/                 # client, arsip, Client List, log, lampiran (multer), conversation, export CSV
├── kontrak/                 # daftar harga per Bill To + priceList() (dipakai Create Invoice)
├── invoices/                # invoice, Create Invoice, Update Request, lampiran, export CSV, data cetak
└── reminders/               # Email Reminder (reminder.logic.ts = aturan murni), penjadwal croner, kirim nodemailer, System Configurator
prisma/
├── schema.prisma            # skema lengkap semua modul
├── migrations/              # 20261027055953_init
└── seed.ts
scripts/
└── setup-db.mjs             # buat role + database aplikasi tanpa psql
storage/uploads/             # file lampiran (git-ignored, berisi data pribadi)
```

## Endpoint

Semua di bawah prefix `/api`. Dokumentasi lengkap & coba langsung: `/api/docs` (Swagger).

| Endpoint | Menu (hak akses) | Keterangan |
|---|---|---|
| `POST /auth/login`, `GET /auth/me`, `POST /auth/change-password`, `PATCH /auth/profile` | — | Login & akun sendiri |
| `/users`, `/roles`, `/role-access/:roleId`, `GET /roles/options` | `users`, `roles`, `role-access` | Security (tahap 1) |
| `GET /master/options` | cukup login | Pilihan dropdown: sponsor, project, bill to, bank, keperluan, pajak |
| `GET/POST /master/:slug`, `GET/PATCH/DELETE /master/:slug/:id` | `:slug` | Slug: `sponsors`, `sponsor-projects`, `bill-to`, `keperluan`, `companies`, `bank-accounts`, `taxes` |
| `GET /clients`, `GET /clients/archived` | `clients`, `clients.archived` | List + filter: `sponsorId`, `keperluanId`, `from`/`to` (tgl permohonan), `expiring` (hari), `uninvoiced`, `unpaid` |
| `GET /clients/export` | `clients` (lihat) | CSV sesuai filter (`archived=true` untuk arsip), maks 50.000 baris |
| `GET /clients/people` | `clients.people` | Orang unik (nama + paspor) + jumlah permohonan |
| `GET /clients/logs` | `clients.log` | Audit (snapshot JSON per aksi) |
| `GET/POST /clients`, `GET/PATCH/DELETE /clients/:id` | `clients` | Detail termasuk lampiran, conversation, 20 riwayat terakhir |
| `POST /clients/:id/archive` | `clients` | `{ archive, reason }` |
| `POST /clients/:id/conversations` | `clients` (**lihat** cukup) | Catatan per client, seperti production |
| `POST /clients/:id/attachments` | `clients` | Multipart field `files` (maks 20 file × 20 MB) |
| `GET /clients/attachments/:aid/file`, `DELETE /clients/attachments/:aid` | `clients` | Unduh / hapus lampiran |
| `GET /invoices`, `GET /invoices/export` | `invoices` | List + filter `status`, `from`/`to` (invoice date), `sponsorId`, `billToId`; response list ditambah `amount` (jumlah total sesuai filter). Search ikut mencari nama/paspor client |
| `GET /invoices/invoiceable-clients` | `invoices` **atau** `invoices.create` (lihat) | Client belum ber-invoice & tidak diarsip (maks 500): `sponsorId`, `projectId`, `billToId` (project), `search` |
| `GET /invoices/price-list?billToId&date` | `invoices` (lihat) | Harga Kontrak yang berlaku |
| `POST /invoices` | `invoices.create` | `{ clientIds, companyId, billToId? }` → invoice DRAFT; balasan `{ id, no, missingPrice }` |
| `GET/PUT/DELETE /invoices/:id`, `GET /invoices/:id/print` | `invoices` | PUT = simpan seluruh header + grup + item + pajak sekaligus |
| `POST /invoices/:id/attachments`, `GET /invoices/attachments/:aid/file`, `DELETE /invoices/attachments/:aid` | `invoices` | Tambah/hapus hanya saat invoice bisa diedit |
| `POST /invoices/:id/request-edit` (`{ reason }`), `POST /invoices/:id/cancel-request` | `invoices` | Izin edit invoice FINAL/PAID |
| `GET /invoices/requests`, `POST /invoices/requests/:rid/approve\|reject` | `invoices.requests` | Lihat / putuskan Update Request |
| `GET/POST /kontrak`, `GET/PUT/DELETE /kontrak/:id` | `kontrak` | PUT = ganti header + seluruh item harga |
| `GET /reminders` | `reminders` | Jumlah per kategori, status jadwal (cron, zona waktu, berikutnya), kesiapan SMTP & penerima |
| `GET /reminders/items?type=`, `GET /reminders/logs` | `reminders` | Daftar client per kategori; Notification Log (filter `status`, `type`, `search`) |
| `POST /reminders/run` (`{ force? }`), `POST /reminders/reload-schedule` | `reminders` (edit) | Kirim sekarang / kirim ulang paksa; muat ulang jadwal |
| `/master/email-templates`, `/master/email-recipients` | slug yang sama | Lewat master generik |
| `GET/POST /system-config`, `PUT/DELETE /system-config/:key`, `POST /system-config/test-email` | `system-config` | Nilai key rahasia (`SMTP_PASSWORD`, `*SECRET*`, `*TOKEN*`) tidak pernah dikirim balik; key bawaan tidak bisa dihapus |

## Hak akses

- Setiap endpoint butuh Bearer token, kecuali yang diberi `@Public()`.
- `@Menu('users')` pada controller/handler: GET butuh hak **Lihat**, selain GET butuh **Edit** pada menu itu
  (matriks `role_menus`, diatur dari halaman *Security → Hak Akses Role*). `@Menu(key, 'view')` memaksa cukup hak lihat.
- Master data memakai satu controller generik, jadi hak akses dicek per slug di controller (key menu = slug).
- Role **Developer** selalu punya akses penuh supaya tidak bisa terkunci.
- List memakai format `{ data, total, page, pageSize }` dengan query `page`, `pageSize`, `sort`, `order`, `search`.

## Aturan bisnis Client

- **Expired Dokumen otomatis**: bila kosong dan Keperluan punya periode, dihitung dari tanggal sumber + periode
  (`computeExpired` di `packages/shared/src/client.ts` — fungsi yang sama dipakai web untuk hint di form).
  Isi manual tidak ditimpa; kosongkan untuk menghitung ulang.
- Project harus milik Sponsor yang dipilih (400 bila tidak cocok).
- Client yang sudah terhubung ke invoice tidak bisa dihapus.
- Setiap insert/update/delete/arsip/lampiran dicatat di `client_logs` beserta snapshot data.
- Tanggal dikirim/diterima sebagai `YYYY-MM-DD` (kolom `@db.Date`, disimpan UTC tengah malam).

## Aturan bisnis Invoice & Kontrak

- **Create Invoice**: hanya client yang tidak diarsip, belum terhubung ke invoice, dan kolom No Invoice-nya kosong.
  Nomor dari `Company.noFormat` dengan `lastNo` dinaikkan secara atomik di transaksi yang sama (dua user bersamaan
  tidak mendapat nomor sama; bila gagal, `lastNo` ikut batal). Tanggal = hari ini, Bill To = pilihan user atau Bill To
  project client pertama (NPWP ikut), bank & Important Information dari Company (cadangan: config
  `DEFAULT_ADDITIONAL_INFORMATION`). Satu grup per Keperluan, pax = jumlah client, harga dari Kontrak Bill To
  (`priceList`), cadangan harga default Keperluan; `missingPrice` = jumlah grup yang tetap 0.
- **Simpan (PUT)**: item kosong dan grup tanpa item/client dibuang; satu client hanya boleh di satu grup dan tidak boleh
  milik invoice lain. Sub total, nilai pajak master (persentase × sub total, REDUCTION negatif, dibulatkan rupiah),
  total, dan terbilang dihitung API dengan `computeInvoiceTotals` (`packages/shared/src/invoice.ts`, dipakai juga web
  untuk total di form). Baris pajak "Other" (tanpa taxId) memakai nilai isian.
- Status **FINAL/PAID** wajib punya No, Date, Company, Bill To, dan minimal satu item. Paid Date hanya disimpan saat
  PAID (kosong → hari ini).
- Kolom `noInvoice`, `tanggalInvoice`, `tanggalPembayaranInvoice`, `invoiceId` di client selalu disinkronkan oleh
  modul ini (client keluar dari invoice → dikosongkan); tiap perubahan dicatat di `client_logs` (`INVOICE`,
  `INVOICE_UPDATE`, `INVOICE_REMOVE`).
- **Terkunci**: invoice bisa diedit bila DRAFT atau Update Request terakhir APPROVED. Izin itu hanya untuk satu kali
  simpan (request → DONE). Hanya satu request PENDING/APPROVED per invoice. Peminta tidak boleh memutuskan request-nya
  sendiri, kecuali role Developer.
- **Hapus invoice**: DRAFT oleh pemegang edit `invoices`; FINAL/PAID hanya oleh pemegang edit `invoices.requests`.
  `lastNo` Company tidak dikembalikan (sama seperti production).
- **Kontrak**: nama item kosong = nama Keperluan, alamat kosong = alamat Bill To, nama layanan tidak boleh ganda dalam
  satu kontrak. `priceList(billTo, date)` = item dari kontrak terbaru dengan tanggal ≤ date per nama layanan (kontrak
  tanpa tanggal dianggap paling lama).
- **Cetak**: halaman web `/print/invoices/:id` (A4, Print / Simpan PDF lewat browser) memakai `GET /invoices/:id/print`;
  penanda tangan = `Company.signedBy`, cadangan config `DISETUJUI_OLEH`.

## Aturan bisnis Email Reminder

- Kategori (`categorize()` di `src/reminders/reminder.logic.ts`, hari dihitung dari tanggal server):
  - **Reminder ke-2 expired**: sisa hari ≤ Reminder Expired ke-2 Keperluan (kosong → config `EXPIRED_SECOND_REMINDER_DAYS`, default 14), termasuk yang sudah lewat.
  - **Dokumen akan expired**: sisa hari ≤ Reminder Expired Keperluan (default 60) dan belum masuk kategori ke-2.
    Kedua kategori expired dilewati selama Proses Perpanjangan terisi.
  - **Belum dibuat invoice**: selesai diproses ≥ Reminder Pembuatan Invoice hari (default 14), belum punya invoice.
  - **Invoice belum dibayar**: invoice berumur ≥ Reminder Pembayaran Invoice hari (default 30), belum ada tanggal pembayaran.
  - **Perlu EPO**: Keperluan bernama EPO / Exit Permit yang belum selesai diproses.
  - Nilai 0 di reminder invoice Keperluan menonaktifkan kategori itu. Client yang diarsip tidak ikut.
- Satu email per kategori yang punya client, memakai Email Template dengan `code` = kategori (`{{TABLE}}` diganti
  tabel client dengan link `SITE_URL/clients/:id`; nilai di-escape). Subject = subject template + `(N client) - tanggal`.
- Penerima: kategori invoice → Email Recipient bertanda Accounting, lainnya → penerima umum; bila kelompok itu tidak
  punya penerima TO aktif, dipakai kelompok lainnya.
- Satu kategori hanya terkirim sekali per hari (`reminder_logs.ref_key = TYPE:YYYY-MM-DD` berstatus SENT) kecuali
  "Kirim ulang (paksa)". Setiap percobaan dicatat: SENT, NOT SENT (SMTP/penerima belum ada), FAILED (+ pesan error).
  Dua pengiriman bersamaan di satu proses ditolak (409).
- **Penjadwal**: croner di dalam proses API, dari config `REMINDER_ENABLED` (1/0), `REMINDER_CRON` (default
  `0 8 * * 1-5`), `REMINDER_TIMEZONE` (default `Asia/Jakarta`). Mengubah key itu lewat System Configurator memuat ulang
  jadwal saat itu juga. Cron tidak valid dilaporkan di halaman Email Reminder.
- Library dikunci ke versi yang sudah ≥ 2 minggu dirilis: `nodemailer@10.1.7`, `croner@10.0.1`.

## Test

- `npm test` — unit test aturan hitung invoice (`src/invoices/invoice-calc.spec.ts`) dan aturan reminder
  (`src/reminders/reminder.logic.spec.ts`).

## Catatan teknis

- **Prisma di-pin ke 7.10.1** (tag `latest` npm saat ini menunjuk ke rilis kandidat 8.0). Client di-generate ke
  `src/generated/prisma` (ESM, git-ignored); `npm run build` menjalankan `prisma generate` lebih dulu.
- **npm 10.9.2** punya bug saat resolusi peer dependency NestJS 12; `.npmrc` berisi `legacy-peer-deps=true`.
- **Field DTO selalu ada setelah `plainToInstance`** (bernilai `undefined`, karena target ES2023). Untuk update parsial,
  cek `dto[field] !== undefined`, jangan `field in dto` — kesalahan ini sempat membuat PATCH mengosongkan nama client.
- **Paralel vs transaksi**: query baca (list + count) memakai `Promise.all`. Tulis yang harus berurutan/atomik
  (mis. ganti matriks hak akses) memakai `prisma.$transaction(async (tx) => …)`, bukan `Promise.all`.
- `SerializeInterceptor` hanya mengubah objek polos; `StreamableFile`, `Date`, dll. dibiarkan agar unduhan tidak rusak.
