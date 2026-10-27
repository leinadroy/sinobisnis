# Smlgroupid

## Tech stack

Next.js (web, SEO) + NestJS (API) + Tailwind + shadcn/ui + Data Table (TanStack) + Prisma + PostgreSQL, all TypeScript. Details and conventions: `docs/tech-stack.md` — follow it for any new app code.

## Database (READ-ONLY)

- MariaDB 10.4 at 10.10.3.23 (needs VPN), database `sinobisnis`. Credentials in `.env` (not committed; template in `.env.example`).
- **This project only reads the database. Never write to it** — no INSERT/UPDATE/DELETE/DDL, not even "just to test".
- Always go through `tools/db.py` (`query()` in code, or `python tools/db.py "SELECT ..."` from the shell). It allows one SELECT/SHOW/DESCRIBE/EXPLAIN/WITH statement per call and locks the session READ ONLY. Do not open raw connections that bypass it.
- The `gxmysql` user has ALL PRIVILEGES on the server, so these guards are the only thing preventing writes.
- `attachment` (~7.7 GB) and `invoiceattachment` (~2.3 GB) store file blobs. Never `SELECT *` from them; select the needed non-blob columns, and always use WHERE/LIMIT.

## Apps

- `apps/invoice-printer/` — self-contained Python/Tkinter desktop app (deliberately simple, not the Next.js/NestJS stack). Enter an invoice number or InvoiceId → `hasil/<InvoiceNo>/` with the invoice PDF, invoice+attachments merged PDF (bookmarked), and `attachments/` + `index.csv`. Has its own `.env` and its own copy of the read-only DB guard (`invoiceprint/db.py`) so the folder can be copied to another PC. See its README.
- Invoice layout is chosen by the invoice-number prefix: SML → `layout.py` (`build_sml`), RTS → `layout_rts.py`, JCSS → `layout_jcss.py` (modelled on `SML-/RTS-/JCSS-Invoice.pdf` in the project root); unknown prefixes fall back to SML. Typo fixes (`CORRECTIONS`) are in `layout.py`; DB → invoice mapping in `docs/invoice-mapping.md`.
- A few name lines in `invoicedetail` were saved with Qty > 0 but price 0 ("12. Zhu Yanhua"); `service.load` treats numbered zero-price lines as names. Zero-price service lines without a number are real and stay services.
- `apps/invoice-web/` — FastAPI web version for the office server (login, job queue, downloads incl. ZIP, auto-cleanup). Users in `data/users.json` via `manage_users.py` (not the sinobisnis `users` table). Its `invoiceprint/` and `assets/` are **copies** of the desktop app's — apply core/layout fixes to both. Local preview: `.claude/launch.json` → `invoice-web` on port 8000. See its README for deployment.
- `apps/api/` (NestJS 12 + Prisma 7.10.1 + **local PostgreSQL**, db `sinobisnis_app`) and `apps/web/` (Next.js 16 + Tailwind + shadcn/ui base-nova + TanStack Table v8, port 3001) — the new Sinobisnis app, rebuilt in stages from the prototype in `C:\VibeCode\SinobisnisApps` (Express/SQLite, used as functional spec). Its PostgreSQL is separate from the read-only MariaDB above. Setup, endpoints, business rules and stage status: `apps/api/README.md`.
  - **Done:** stage 1 (Prisma schema for all modules, JWT auth, users, roles, role-access matrix) and stage 2 (7 master-data entities, client module: list/filters, form, attachments, archive, conversation, Client List, log, CSV export). **Next:** stage 3 invoice + kontrak + print, stage 4 email reminders, stage 5 data migration from MariaDB (read-only).
  - `packages/shared` (ESM) holds the menu definition, role-access defaults, `MASTER_ENTITIES` (field/column config driving both the generic API master controller and the generic web pages `/master/[entity]`), client types and `computeExpired`. Rebuild with `npm run build:shared` after edits.
  - Web never talks to the DB: server components/actions call the API via `lib/api.ts` with the JWT from an httpOnly cookie; file upload/download/export go through route handlers under `app/bff/` (excluded from `proxy.ts`). `DataTable` keeps paging/sort/search in the URL; pass `renderCard` for a phone card layout (used by the client list).
  - Checking pages in the hidden Claude browser pane: React reveals streamed `<Suspense>` content on `requestAnimationFrame`, which does not run there, so lists look empty/unhydrated. Flush with `window.$RV(window.$RB)` in the page before asserting; real browsers are unaffected.
  - Dev PC: PostgreSQL 18's `bin` is missing `libpq.dll`, so the Windows service fails (1053) and `psql` crashes on XAMPP's DLL; the server is started manually with `pg_ctl` and stops on reboot until the install is repaired. Use `apps/api/scripts/setup-db.mjs` instead of psql.
- `output/`, `apps/invoice-printer/hasil/` and `apps/invoice-web/data/` hold personal documents (passports etc.) and are git-ignored.
