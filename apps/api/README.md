# Sinobisnis — apps/api (NestJS + Prisma + MariaDB)

REST API aplikasi Sinobisnis, **pengganti total** aplikasi GeneXus. Frontend ada di `apps/web` (Next.js); type, menu,
matriks hak akses, definisi master data, dan aturan bisnis bersama ada di `packages/shared`.
Standar: [`docs/tech-stack.md`](../../docs/tech-stack.md).

> **Struktur database = struktur production** (MariaDB 10.10.3.23, database `sinobisnis`). `prisma/schema.prisma`
> memetakan tabel & kolom GeneXus apa adanya lewat `@map`/`@@map`, dan **struktur tidak boleh diubah**: tidak ada
> migrasi Prisma; `prisma migrate diff` terhadap database harus kosong. Development memakai MariaDB lokal (XAMPP)
> bernama `sinobisnis` yang merupakan salinan production (struktur + data, tanpa blob). Production tetap **read-only**
> dari project ini (lihat `CLAUDE.md`).

## Status

| Tahap | Isi | Status |
|---|---|---|
| 1 | Login JWT, Users, Role, Hak Akses Role (tabel `users`, `role`, `rolepgmname`, `menuitem`) | ✅ |
| 2 | Master data (7 entitas) + Client (list/filter, form, lampiran, arsip, conversation, Client List, log, export CSV) | ✅ |
| 3 | Invoice (Create Invoice, grup → item, pajak, lampiran, export), Update Request, Kontrak, cetak invoice | ✅ |
| 4 | Email Reminder (aturan aplikasi lama), penjadwal otomatis; Developer Menu: Email Template, Email Recipient, System Configurator | ✅ |
| 5 | Pindah ke struktur production (MariaDB) — semua modul ditulis ulang di atas tabel GeneXus | ✅ |

## Setup pertama

1. Jalankan MariaDB lokal (XAMPP) dan buat database `sinobisnis` + user dengan hak penuh pada database itu.
2. Isi `LOCAL_DB_*` di `.env` root project, lalu salin struktur + data production (butuh VPN; production hanya dibaca
   lewat `tools/db.py`, kolom blob lampiran dikosongkan):
   ```bash
   python tools/migrate/clone_production.py all --replace   # dari root project
   python tools/migrate/clone_production.py verify          # bandingkan struktur & jumlah baris
   ```
   Script menolak host selain localhost.
3. Salin `.env.example` → `.env` di folder ini; isi `DATABASE_URL` (`mysql://user:password@localhost:3306/sinobisnis`,
   password di-URL-encode) dan `JWT_SECRET`.
4. Dari akar monorepo:
   ```bash
   npm run install:all   # shared + api + web
   npm run dev:api       # http://localhost:4000/api  (Swagger: /api/docs)
   npm run dev:web       # http://localhost:3001
   ```
5. **Password user**: hash GeneXus lama tidak bisa diverifikasi (algoritmanya tidak diketahui). Atur password baru lewat
   *Security → Users*, atau dari folder ini `npm run user:password -- <username>` (prompt tersembunyi, atau env
   `USER_PASSWORD`; sekaligus mengaktifkan user). Password baru disimpan bcrypt di `UsersHashedPassword` dengan
   `UsersSalt = 'bcrypt'`.

### Variabel `.env`

| Nama | Keterangan |
|---|---|
| `DATABASE_URL` | Koneksi MariaDB (`mysql://…`; adapter memakai `mariadb://`) |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Penandatanganan token login (default 12h) |
| `PORT`, `WEB_ORIGIN` | Port API (4000) & origin web untuk CORS |
| `REMINDER_SCHEDULER` | `off` = matikan penjadwal reminder di instance ini (pakai bila API dijalankan lebih dari satu) |

## Struktur

```
src/
├── main.ts                  # prefix /api, ValidationPipe global, CORS, Swagger
├── app.module.ts            # + SerializeInterceptor global
├── prisma/                  # PrismaService + adapter.ts (PrismaMariaDb)
├── common/
│   ├── dates.ts             # DATE ↔ 'YYYY-MM-DD', tanggal kosong GeneXus (1000-01-01), DATETIME jam lokal
│   ├── decorators.ts        # @Public, @Menu(key, mode?), @CurrentUser
│   ├── list-query.dto.ts    # page/pageSize/sort/order/search + paginated()
│   └── serialize.interceptor.ts  # Decimal/BigInt → number di semua response
├── auth/                    # login JWT, /auth/me, ganti password/profil, guard global (JWT + hak akses menu)
├── users/  roles/           # user, role + matriks hak akses (rolepgmname)
├── master/                  # master data generik: config per entitas + DTO class-validator
├── clients/                 # client, arsip, Client List, log (datalog), lampiran (blob), conversation, export CSV
├── kontrak/                 # kontrak + kontrakdetail, priceList() (dipakai Create Invoice)
├── invoices/                # invoice, Create Invoice, Update Request, lampiran, export CSV, data cetak
│                            #   invoice-rows.ts = baris invoicedetail ↔ grup (nama TKA + layanan)
└── reminders/               # Email Reminder (reminder.logic.ts = aturan murni), penjadwal croner, nodemailer, System Configurator
prisma/schema.prisma         # pemetaan tabel production (tanpa folder migrations)
scripts/set-password.ts      # npm run user:password
```

## Endpoint

Semua di bawah prefix `/api`. Dokumentasi lengkap & coba langsung: `/api/docs` (Swagger).

| Endpoint | Menu (hak akses) | Keterangan |
|---|---|---|
| `POST /auth/login`, `GET /auth/me`, `POST /auth/change-password`, `PATCH /auth/profile` | — | Login & akun sendiri |
| `/users`, `/roles`, `/role-access/:roleId`, `GET /roles/options` | `users`, `roles`, `role-access` | Security |
| `GET /master/options` | cukup login | Pilihan dropdown: sponsor, project, bill to, bank, keperluan, pajak, company |
| `GET/POST /master/:slug`, `GET/PATCH/DELETE /master/:slug/:id` | `:slug` | `sponsors`, `sponsor-projects`, `bill-to`, `keperluan`, `companies`, `bank-accounts`, `taxes`, `email-templates`, `email-recipients` |
| `GET /clients`, `GET /clients/archived` | `clients`, `clients.archived` | List + filter: `sponsorId`, `keperluanId`, `from`/`to` (tgl permohonan), `expiring` (hari), `uninvoiced`, `unpaid` |
| `GET /clients/export` | `clients` (lihat) | CSV sesuai filter (`archived=true` untuk arsip), maks 50.000 baris |
| `GET /clients/people` | `clients.people` | Orang unik (nama + paspor) + jumlah permohonan |
| `GET /clients/logs` | `clients.log` | `datalog` TableName `Client` (snapshot JSON per aksi) |
| `GET/POST /clients`, `GET/PATCH/DELETE /clients/:id` | `clients` | DELETE = hapus lunak (`ClientIsDelete`) |
| `POST /clients/:id/archive` | `clients` | `{ archive, reason }` |
| `POST /clients/:id/conversations` | `clients` (**lihat** cukup) | Tabel `conversation` (TableName `Client`) |
| `POST /clients/:id/attachments` | `clients` | Multipart field `files`; file disimpan sebagai blob di `attachment` |
| `GET /clients/attachments/:aid/file`, `DELETE /clients/attachments/:aid` | `clients` | Unduh / hapus lampiran |
| `GET /invoices`, `GET /invoices/export` | `invoices` | List + filter `status`, `from`/`to`, `sponsorId`, `billToId`; `amount` = jumlah total sesuai filter |
| `GET /invoices/invoiceable-clients` | `invoices` **atau** `invoices.create` (lihat) | Client belum ber-invoice (No Invoice kosong), tidak diarsip/dihapus |
| `GET /invoices/price-list?billToId&date` | `invoices` (lihat) | Harga Kontrak yang berlaku per Keperluan |
| `POST /invoices` | `invoices.create` | `{ clientIds, companyId, billToId? }` → invoice DRAFT |
| `GET/PUT/DELETE /invoices/:id`, `GET /invoices/:id/print` | `invoices` | PUT = simpan header + grup + item + pajak sekaligus |
| `POST /invoices/:id/attachments`, `GET /invoices/attachments/:aid/file`, `DELETE /invoices/attachments/:aid` | `invoices` | Hanya saat invoice bisa diedit |
| `POST /invoices/:id/request-edit`, `POST /invoices/:id/cancel-request` | `invoices` | Izin edit invoice FINAL/PAID (tabel `updaterequest`; tidak ada kolom alasan) |
| `GET /invoices/requests`, `POST /invoices/requests/:rid/approve\|reject` | `invoices.requests` | Lihat / putuskan Update Request |
| `GET/POST /kontrak`, `GET/PUT/DELETE /kontrak/:id` | `kontrak` | PUT = ganti header + seluruh harga |
| `GET /reminders` | `reminders` | Jumlah per kategori, status jadwal, kesiapan SMTP & penerima |
| `GET /reminders/items?type=` | `reminders` | Client hari ini per kategori (semua Keperluan) |
| `GET /reminders/logs` | `reminders` | Log dari `datalog` TableName `Reminder`; filter `status`, `type`, `search`, `withEmpty=1` (ikut log "(0 items)") |
| `POST /reminders/run` (`{ force? }`), `POST /reminders/reload-schedule` | `reminders` (edit) | Kirim sekarang / kirim ulang paksa; muat ulang jadwal |
| `GET/POST /system-config`, `PUT/DELETE /system-config/:key`, `POST /system-config/test-email` | `system-config` | Tabel `systemconfigurator`; nilai rahasia (`SMTP Password`, `System Salt`, key berisi password/secret/token/salt) tidak pernah dikirim balik; key bawaan tidak bisa dihapus |

## Hak akses

- Setiap endpoint butuh Bearer token, kecuali yang diberi `@Public()`.
- Hak akses dari `rolepgmname` per `MenuItemId` (menu di `packages/shared/src/menu.ts` punya `menuItemId`).
  `@Menu('users')`: GET butuh **Lihat**, selain GET butuh **Edit**. Menu baru yang tidak ada di aplikasi lama (Tax, Hak
  Akses Role, Email Reminder, Email Recipient, System Configurator; id 38–42) ditambahkan ke `menuitem` saat API start.
- Role **Developer** selalu punya akses penuh supaya tidak bisa terkunci.
- List memakai format `{ data, total, page, pageSize }` dengan query `page`, `pageSize`, `sort`, `order`, `search`.

## Konvensi data GeneXus

- Tanggal kosong = `1000-01-01` (kolom NOT NULL), teks kosong = `''`, id `0` = tidak ada. API mengubahnya ke `null`.
- Baris placeholder "== Please Select ==" (company 0, bill to 267) disembunyikan dari pilihan.
- `client.ClientNo` dan `invoice.InvoiceId` BigInt → dikirim sebagai number. Collation `utf8_general_ci` sudah
  tidak peka huruf besar/kecil, jadi pencarian tidak memakai `mode: 'insensitive'`.
- Client ↔ invoice hanya lewat teks `ClientNoInvoice`. `invoices.no` tidak unik (ada nomor ganda lama).

## Aturan bisnis Client

- **Expired Dokumen otomatis**: bila kosong dan Keperluan punya periode, dihitung dari tanggal sumber + periode
  (`computeExpired` di `packages/shared/src/client.ts`, dipakai juga web). Isi manual tidak ditimpa.
- Project harus milik Sponsor yang dipilih. Nama maks 40 karakter (lebar kolom production).
- Setiap insert/update/delete/arsip/lampiran dicatat di `datalog` (TableName `Client`) dengan snapshot ber-key GeneXus.
- Lampiran disimpan sebagai blob di `attachment`; `CountAttachment` di client dijaga.

## Aturan bisnis Invoice & Kontrak

- **Baris invoice**: `invoicedetail` Qty > 0 = layanan, Qty 0 (atau harga 0 bernomor) = nama TKA. Grup dibentuk dari
  urutan baris (layanan setelah nama memulai grup baru); nama ditulis kembali sebagai "1. Nama".
- **Nomor**: `CompanyInvoiceLastNo + 1` dengan format GeneXus (`@YY@`, `@YYYY@`, `@ROM@`, `@MM@`, `@autonumber@` min.
  3 digit). Baris company dikunci (`SELECT … FOR UPDATE`) di transaksi yang sama; nomor yang sudah dipakai dilewati.
- Pajak (`invoicetax`) tidak punya TaxId — dicocokkan dengan master pajak lewat deskripsi.
- Terbilang disimpan dalam format lama `#Indonesia Rupiah …#`; Paid Date kosong = `1000-01-01`.
- Rumus total, terbilang, dan format nomor ada di `packages/shared/src/invoice.ts` (dipakai API dan web).
- **Update Request**: `updaterequest` + `invoice.InvoiceEditStatus` (PENDING/APPROVED/REJECTED/CANCELED/DONE).
  Izin edit hanya untuk satu kali simpan (APPROVED → DONE).
- **Kontrak**: `kontrak` (tanggal, Bill To, nomor) + `kontrakdetail` (Keperluan, durasi, harga), satu harga per
  Keperluan. `priceList(billTo, date)` = harga dari kontrak terbaru dengan tanggal ≤ date.
- **Cetak**: halaman web `/print/invoices/:id` memakai `GET /invoices/:id/print`.

## Aturan bisnis Email Reminder

Ditulis ulang sama dengan aplikasi lama (diverifikasi terhadap 8.276 log reminder lama di `datalog`: 98,7% jumlah
item cocok dengan aturan "tepat hari ke-N", hanya 36% dengan aturan "≥ N hari"):

- Per **Keperluan** dan per kategori, hanya client yang **tepat** jatuh pada hari ke-N, dengan N dari kolom Keperluan;
  **0 = kategori itu nonaktif** untuk Keperluan tersebut (tidak ada nilai default):
  | Kategori | Kolom Keperluan | Syarat | Template (`EmailTemplateId`) |
  |---|---|---|---|
  | Dokumen akan expired | `ReminderExpiredDokumen` | Expired Dokumen = hari ini + N | 1 |
  | Belum dibuat invoice | `ReminderPembuatanInvoice` | Proses Selesai = hari ini − N, No Invoice kosong¹ | 2 |
  | Invoice belum dibayar | `ReminderPembayaranInvoice` | Tgl Invoice = hari ini − N, belum ada tanggal pembayaran | 3 |
  | Reminder ke-2 expired | `ReminderExpired2nd` | Expired Dokumen = hari ini + N | 4 |
  | Perlu EPO | `ReminderEPO` | Expired Dokumen = hari ini + N, EPO kosong | 5 |

  ¹ Aplikasi lama tidak memeriksa invoice; di sini client yang sudah ber-invoice tidak diingatkan lagi.
  Client yang dihapus/diarsip tidak ikut.
- **Satu email per kategori per Keperluan**. Isi = `EmailTemplateContent` dengan `@@Keperluan@@` → nama Keperluan dan
  `@@ClientData@@` → tabel client (link `Site URL/clients/:id`, nilai di-escape). Subject = subject template +
  `- Keperluan (N client)`.
- Penerima: semua Email Recipient aktif sebagai TO — kategori invoice ke yang bertanda Accounting, lainnya ke penerima
  umum; bila kelompok itu kosong dipakai kelompok lainnya.
- **Log** di `datalog` (TableName `Reminder`, TableId 0) dengan teks format lama, mis.
  `Success Run Reminder Pembuatan Invoice NEW ITAS 11 Bulan(3 items) run by System : Y`. Gagal → `Failed Run … : N - pesan`,
  SMTP/penerima belum ada → `Not Sent Run …`. Halaman Notification Log mengurai teks itu (termasuk ~150 ribu log lama).
  Aplikasi lama mencatat semua Keperluan tiap hari termasuk "(0 items)"; aplikasi baru hanya mencatat kiriman.
- Satu kategori + Keperluan hanya terkirim sekali per hari (ada log `Success` hari itu yang bukan "(0 items)", termasuk
  dari aplikasi lama) kecuali "Kirim ulang (paksa)". Dua pengiriman bersamaan di satu proses ditolak (409).
- **Penjadwal**: croner di dalam proses API, dari System Configurator `Reminder Enabled` (1/0), `Reminder Cron` (default
  `0 7 * * *` = 07:00 WIB, jam jalan aplikasi lama yang tercatat 00:00 UTC) dan `Reminder Timezone` (default
  `Asia/Jakarta`). Key ini baru (dibuat saat pertama diisi); mengubahnya memuat ulang jadwal saat itu juga.
  **Biarkan nonaktif selama aplikasi lama masih mengirim reminder**, supaya staf tidak menerima email ganda.
- SMTP dari key lama: `SMTP Host`, `SMTP Port Numeric` (465 = SSL), `SMTP Authentication Numeric` (0 = tanpa login),
  `SMTP Username`, `SMTP Password`; tambahan opsional `SMTP From`.
- Library dikunci: `nodemailer@10.1.7`, `croner@10.0.1`.

## Test

- `npm test` — unit test: hitung invoice (`src/invoices/invoice-calc.spec.ts`), baris invoice ↔ grup
  (`invoice-rows.spec.ts`), aturan & teks log reminder (`src/reminders/reminder.logic.spec.ts`), tanggal (`src/common/dates.spec.ts`).
- Uji end-to-end dijalankan terhadap MariaDB lokal dengan user uji sementara (dan SMTP palsu lokal untuk reminder),
  lalu dibersihkan; **jangan pernah terhadap production**. Database lokal berisi konfigurasi SMTP production — ganti
  `SMTP Host` sebelum menguji pengiriman reminder agar tidak ada email ke staf sungguhan.

## Catatan teknis

- **Prisma di-pin ke 7.10.1** dengan `@prisma/adapter-mariadb@7.10.1` (provider `mysql`). Client di-generate ke
  `src/generated/prisma` (ESM, git-ignored); `npm run build` menjalankan `prisma generate` lebih dulu.
- **DATETIME = UTC**: aplikasi lama menyimpan `DataLogCreated`, `UsersLastLogin`, dll. dalam UTC (aktivitas staf
  tercatat 01:00–15:00 dengan jeda 05:00 = istirahat 12:00 WIB; reminder lama 00:00 = 07:00 WIB), sama dengan adapter
  MariaDB. `dt2s()` mengubah tanggal kosong `1000-01-01` jadi `null`. Kolom DATE memakai `s2d()`/`d2s()` (UTC tengah
  malam, tidak bergeser); "hari ini" memakai `todayStr()` (tanggal lokal server).
- **npm 10.9.2** punya bug saat resolusi peer dependency NestJS 12; `.npmrc` berisi `legacy-peer-deps=true`.
- **Field DTO selalu ada setelah `plainToInstance`** (bernilai `undefined`). Untuk update parsial cek
  `dto[field] !== undefined`, jangan `field in dto`.
- **Paralel vs transaksi**: query baca memakai `Promise.all`; tulis yang harus atomik memakai
  `prisma.$transaction(async (tx) => …)`.
- `SerializeInterceptor` hanya mengubah objek polos; `StreamableFile`, `Date`, dll. dibiarkan agar unduhan tidak rusak.
