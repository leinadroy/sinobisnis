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
| 3 | Invoice (grup → item, pajak, Request To Edit), Kontrak, cetak invoice | belum |
| 4 | Email reminder + penjadwal | belum |
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
└── clients/                 # client, arsip, Client List, log, lampiran (multer), conversation, export CSV
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

## Catatan teknis

- **Prisma di-pin ke 7.10.1** (tag `latest` npm saat ini menunjuk ke rilis kandidat 8.0). Client di-generate ke
  `src/generated/prisma` (ESM, git-ignored); `npm run build` menjalankan `prisma generate` lebih dulu.
- **npm 10.9.2** punya bug saat resolusi peer dependency NestJS 12; `.npmrc` berisi `legacy-peer-deps=true`.
- **Field DTO selalu ada setelah `plainToInstance`** (bernilai `undefined`, karena target ES2023). Untuk update parsial,
  cek `dto[field] !== undefined`, jangan `field in dto` — kesalahan ini sempat membuat PATCH mengosongkan nama client.
- **Paralel vs transaksi**: query baca (list + count) memakai `Promise.all`. Tulis yang harus berurutan/atomik
  (mis. ganti matriks hak akses) memakai `prisma.$transaction(async (tx) => …)`, bukan `Promise.all`.
- `SerializeInterceptor` hanya mengubah objek polos; `StreamableFile`, `Date`, dll. dibiarkan agar unduhan tidak rusak.
