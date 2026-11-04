# Tech Stack — Smlgroupid

Standar teknologi untuk semua aplikasi di project ini.

## Ringkasan

| Lapisan | Teknologi | Alasan |
|---|---|---|
| Frontend / Web | **Next.js** (App Router, TypeScript) | SEO bagus (SSR/SSG), routing & rendering bawaan |
| Backend / API | **NestJS** (TypeScript) | Struktur modul rapi, cocok untuk REST API, validasi & DI bawaan |
| Styling | **Tailwind CSS** | Utility-first, konsisten, cepat |
| Komponen UI | **shadcn/ui** | Komponen siap pakai (Radix UI + Tailwind), kode ada di repo sendiri |
| Tabel data | **shadcn/ui Data Table** (TanStack Table) | Sorting, filter, pagination, column visibility, row selection |
| ORM | **Prisma** (adapter MariaDB) | Schema type-safe, query client otomatis |
| Database | **MariaDB** dengan struktur production `sinobisnis` | Aplikasi baru menggantikan aplikasi GeneXus di atas tabel yang sama |
| Bahasa | **TypeScript** di frontend dan backend | Satu bahasa, type bisa dibagi antar app |

## Arsitektur

```
Browser
  │
  ▼
Next.js (apps/web)          ← halaman, SEO, UI (Tailwind + shadcn/ui + Data Table)
  │  fetch / REST (JSON)
  ▼
NestJS (apps/api)           ← business logic, auth, validasi, REST API
  │  Prisma Client
  ▼
MariaDB (struktur sinobisnis) ← data aplikasi
```

- Next.js **tidak** mengakses database langsung; semua data lewat API NestJS.
- Prisma hanya dipakai di NestJS (`apps/api`).

## Struktur folder (monorepo)

```
Smlgroupid/
├── apps/
│   ├── web/                # Next.js + Tailwind + shadcn/ui
│   │   ├── app/            # App Router (pages, layouts)
│   │   ├── components/
│   │   │   ├── ui/         # komponen shadcn/ui (hasil `npx shadcn add ...`)
│   │   │   └── data-table/ # komponen Data Table reusable
│   │   └── lib/
│   └── api/                # NestJS
│       ├── src/
│       │   ├── modules/    # 1 folder per fitur (invoice, client, ...)
│       │   └── prisma/     # PrismaService
│       └── prisma/
│           └── schema.prisma
├── packages/
│   └── shared/             # type / DTO yang dipakai web dan api
├── docs/
└── tools/                  # script Python (invoice PDF, export lampiran)
```

## Konvensi

### Frontend (Next.js)
- App Router + Server Components secara default; `"use client"` hanya untuk komponen interaktif.
- Halaman publik pakai `generateMetadata` untuk SEO (title, description, Open Graph).
- Styling hanya pakai Tailwind; jangan tambah CSS framework lain.
- Komponen UI ambil dari shadcn/ui dulu sebelum membuat sendiri.
- Form: `react-hook-form` + `zod` (pola bawaan shadcn/ui Form).

### Data Table
- Pakai pola **shadcn/ui Data Table** (TanStack Table `@tanstack/react-table`).
- Satu komponen `DataTable` generik di `components/data-table/`, kolom didefinisikan per halaman (`columns.tsx`).
- Fitur standar: sorting, filter/search, pagination, show/hide kolom.
- Untuk data besar, pagination & filter dilakukan **di server** (API NestJS menerima `page`, `pageSize`, `sort`, `search`).

### Backend (NestJS)
- Satu module per fitur: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`.
- Validasi input dengan `class-validator` + `ValidationPipe` global.
- Response list memakai format: `{ data: [...], total, page, pageSize }`.
- Dokumentasi API dengan Swagger (`@nestjs/swagger`).

### Database (Prisma + MariaDB)
- Schema di `apps/api/prisma/schema.prisma` memetakan tabel production GeneXus apa adanya. **Struktur tidak boleh
  diubah** (tidak ada `prisma migrate`; `prisma migrate diff` terhadap database harus kosong).
- Nama model PascalCase dan field camelCase, di-map ke nama tabel/kolom lama dengan `@@map`/`@map`.
- Koneksi lewat `DATABASE_URL` di `.env` (tidak di-commit). Konvensi data GeneXus (tanggal kosong `1000-01-01`,
  DATETIME jam lokal, dll.) dijelaskan di `apps/api/README.md`.

## Catatan: database production (sinobisnis)

- Production ada di **MariaDB** `sinobisnis` (10.10.3.23, butuh VPN). Dari project ini aksesnya **read-only**
  (lihat `CLAUDE.md` dan `tools/db.py`).
- Development memakai salinan lokal: `python tools/migrate/clone_production.py all --replace` (struktur + data, tanpa blob).
- Pemetaan tabel invoice ada di [`docs/invoice-mapping.md`](invoice-mapping.md).
