import { PrismaMariaDb } from '@prisma/adapter-mariadb';

/** Perintah yang dijalankan di setiap koneksi profil hanya-baca (sama dengan pengaman tools/db.py). */
export const READ_ONLY_INIT_SQL = ['SET SESSION TRANSACTION READ ONLY', 'SET SESSION max_statement_time = 120'];
/** Koneksi khusus tabel users di profil hanya-baca: bisa menulis, tapi hanya dipakai lewat usersOnlyClient(). */
export const USERS_ONLY_INIT_SQL = ['SET SESSION max_statement_time = 120'];

/**
 * Driver adapter Prisma untuk MariaDB (dipakai API dan script).
 * DATABASE_URL memakai skema mysql:// (dibaca juga oleh Prisma CLI); driver mariadb memakai mariadb://.
 * `readOnly`: setiap koneksi di pool dikunci READ ONLY oleh MariaDB sendiri, jadi INSERT/UPDATE/DELETE ditolak server
 * walaupun ada kode yang lolos dari pengaman aplikasi.
 */
export function createAdapter(url = process.env.DATABASE_URL, opts: { readOnly?: boolean; usersOnly?: boolean } = {}) {
  if (!url) throw new Error('DATABASE_URL belum diisi di apps/api/.env.');
  if (!opts.readOnly && !opts.usersOnly) return new PrismaMariaDb(url.replace(/^mysql:\/\//, 'mariadb://'));
  const u = new URL(url.replace(/^mysql:/, 'mariadb:'));
  return new PrismaMariaDb({
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, '')),
    connectTimeout: 10_000,
    // usersOnly: koneksi production yang boleh menulis tabel users saja (pembatasnya di prisma/users-only.ts);
    // sesi tidak READ ONLY, tapi batas waktu query tetap sama.
    connectionLimit: opts.usersOnly ? 2 : 5,
    initSql: opts.usersOnly ? USERS_ONLY_INIT_SQL : READ_ONLY_INIT_SQL,
  });
}
