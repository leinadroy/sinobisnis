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
| ORM | **Prisma** | Schema type-safe, migrasi, query client otomatis |
| Database | **PostgreSQL** | Database utama untuk aplikasi baru |
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
PostgreSQL                  ← data aplikasi
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

### Database (Prisma + PostgreSQL)
- Schema di `apps/api/prisma/schema.prisma`; perubahan schema selalu lewat `prisma migrate`.
- Nama model PascalCase, nama kolom camelCase, tabel di-map ke snake_case (`@@map`).
- Koneksi lewat `DATABASE_URL` di `.env` (tidak di-commit).

## Catatan: database lama (sinobisnis)

- Data invoice yang sudah ada tersimpan di **MariaDB** `sinobisnis` (10.10.3.23), bukan PostgreSQL.
- Akses ke database itu **read-only** (lihat `CLAUDE.md` dan `tools/db.py`).
- Pemetaan tabel invoice ada di [`docs/invoice-mapping.md`](invoice-mapping.md).
- Jika aplikasi baru perlu membaca data lama, pilihannya: migrasi data ke PostgreSQL, atau koneksi Prisma kedua (provider `mysql`) khusus baca.

## Perintah awal (setup)

```bash
# Frontend
npx create-next-app@latest apps/web --typescript --tailwind --eslint --app
cd apps/web && npx shadcn@latest init
npx shadcn@latest add button input table dropdown-menu form
npm install @tanstack/react-table

# Backend
npx @nestjs/cli new apps/api
cd apps/api && npm install prisma @prisma/client class-validator class-transformer @nestjs/swagger
npx prisma init --datasource-provider postgresql
```
