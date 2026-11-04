# Smlgroupid

## Tech stack

Next.js (web, SEO) + NestJS (API) + Tailwind + shadcn/ui + Data Table (TanStack) + Prisma + MariaDB (production `sinobisnis` structure), all TypeScript. Details and conventions: `docs/tech-stack.md` — follow it for any new app code.

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
- `apps/api/` (NestJS 12 + Prisma 7.10.1 + `@prisma/adapter-mariadb`) and `apps/web/` (Next.js 16 + Tailwind + shadcn/ui base-nova + TanStack Table v8, port 3001) — the new Sinobisnis app that **fully replaces** the GeneXus app (no compatibility with it needed). Functional spec was the prototype in `C:\VibeCode\SinobisnisApps`. Setup, endpoints, business rules: `apps/api/README.md`.
  - **Database = production structure.** `prisma/schema.prisma` maps the GeneXus tables/columns as they are (`@map`/`@@map`). Never change the structure: no Prisma migrations, `prisma migrate diff` against the DB must be empty. Dev uses local XAMPP MariaDB `sinobisnis` (credentials: `LOCAL_DB_*` in root `.env`, `DATABASE_URL` in `apps/api/.env`), a clone of production made by `tools/migrate/clone_production.py all --replace` (reads production only via `tools/db.py`; blob columns left empty, so old attachments have no file content locally). Writing to the local clone is fine; production stays read-only.
  - GeneXus conventions: empty date = `1000-01-01`, empty text `''`, id 0 = none, placeholders "== Please Select ==" (company 0, bill to 267) hidden. DATETIME columns hold UTC (the old app stored UTC too — staff activity logs at 01:00–15:00), matching the adapter; `dt2s()` maps empty dates to null. DATE columns use `s2d`/`d2s`; "today" = `todayStr()` (server local date).
  - Passwords: legacy GeneXus hashes can't be verified; new passwords are bcrypt (`UsersSalt='bcrypt'`), set via Security → Users or `npm run user:password -- <username>` in `apps/api`. Access comes from `rolepgmname` per `MenuItemId`; menu ids 38–42 are added to `menuitem` at API start.
  - Invoices: `invoicedetail` qty > 0 = service line, qty 0 (or numbered zero-price) = TKA name; groups derived in `src/invoices/invoice-rows.ts`. Number = `CompanyInvoiceLastNo + 1` with GeneXus tokens, company row locked `FOR UPDATE`. Client ↔ invoice only via text `ClientNoInvoice`; `invoice.InvoiceNo` is not unique. Money rules (`computeInvoiceTotals`, `terbilang`, `formatInvoiceNo`) in `packages/shared/src/invoice.ts`.
  - Reminder: same rule as the old app (verified against legacy `datalog`): per Keperluan, only clients exactly on day N (0 = disabled), one email per category per Keperluan, templates by id 1–5, log text in `datalog` TableName `Reminder`. Pure rules in `apps/api/src/reminders/reminder.logic.ts`. Keep System Configurator `Reminder Enabled` off while the old app still sends reminders. **The local clone holds the real production SMTP settings and recipients** — point `SMTP Host` at a fake local server before testing a send.
  - `packages/shared` (ESM) holds the menu, role-access defaults, `MASTER_ENTITIES` (drives the generic API master controller and web pages `/master/[entity]`), client/invoice/reminder types. Rebuild with `npm run build:shared` after edits.
  - Web never talks to the DB: server components/actions call the API via `lib/api.ts` with the JWT from an httpOnly cookie (`sml_token`); file upload/download/export go through route handlers under `app/bff/`. `DataTable` keeps paging/sort/search in the URL; pass `renderCard` for a phone card layout.
  - Checking pages in the hidden Claude browser pane: React reveals streamed `<Suspense>` content on `requestAnimationFrame`, which does not run there, so lists look empty/unhydrated. Flush with `window.$RV(window.$RB)` in the page before asserting; real browsers are unaffected.
  - The earlier PostgreSQL attempt (stage 5 import into a new schema) is obsolete; a backup is in `output/backup-pg-tahap5/`.
- `output/`, `apps/invoice-printer/hasil/` and `apps/invoice-web/data/` hold personal documents (passports etc.) and are git-ignored.
