import { ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client.js';
import { createAdapter } from './adapter.js';

/**
 * Pengecualian tabel `users` di database hanya-baca (DB_WRITE_USERS_<PROFIL>=1, mis. production).
 *
 * MariaDB tidak bisa dibatasi per tabel tanpa membuat user/GRANT baru (perubahan di server production), jadi koneksi ini
 * TIDAK dikunci READ ONLY oleh server. Pembatasnya ada di sini, untuk setiap query yang lewat klien ini:
 * - baca (find/count/aggregate/groupBy) boleh di semua tabel — perlu untuk role & hak akses;
 * - tulis HANYA `user.create` dan `user.update`, dengan isi `data` berupa nilai kolom biasa (tanpa nested write ke tabel lain);
 * - hapus, upsert, *Many, dan semua SQL mentah ($queryRaw/$executeRaw) ditolak.
 * Koneksi utama profil itu tetap READ ONLY; klien ini hanya dipakai lewat `PrismaService.authDb`.
 */
export const USERS_ONLY_READ_OPS = new Set([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy',
]);
export const USERS_ONLY_WRITE_OPS = new Set(['create', 'update']);

/** 403 di API (bukan 500), pesan jelas di script. */
export class UsersOnlyViolation extends ForbiddenException {
  constructor(what: string) {
    super(`Database ini hanya boleh menulis tabel users; ${what} ditolak.`);
    this.name = 'UsersOnlyViolation';
  }
}

const isPlainValue = (v: unknown) => v === null || v instanceof Date || ['string', 'number', 'boolean', 'bigint'].includes(typeof v);

/** Lempar UsersOnlyViolation bila operasi tidak diizinkan. Dipisah supaya bisa dites tanpa database. */
export function assertUsersOnly(model: string | undefined, operation: string, args: unknown) {
  if (!model) throw new UsersOnlyViolation(`SQL mentah (${operation})`);
  if (USERS_ONLY_READ_OPS.has(operation)) return;
  if (model !== 'User' || !USERS_ONLY_WRITE_OPS.has(operation)) throw new UsersOnlyViolation(`${model}.${operation}`);
  const data = (args as { data?: Record<string, unknown> } | undefined)?.data;
  if (!data || typeof data !== 'object') throw new UsersOnlyViolation(`User.${operation} tanpa data`);
  for (const [k, v] of Object.entries(data)) {
    if (!isPlainValue(v)) throw new UsersOnlyViolation(`User.${operation} dengan isian bertingkat "${k}"`);
  }
}

export function usersOnlyClient(url: string): PrismaClient {
  const base = new PrismaClient({ adapter: createAdapter(url, { usersOnly: true }) });
  const client = base.$extends({
    name: 'users-only',
    query: {
      $allOperations({ model, operation, args, query }) {
        assertUsersOnly(model, operation, args);
        return query(args);
      },
    },
  });
  // Tipe klien extension berbeda dari PrismaClient, perilakunya sama untuk pemakai authDb.
  return client as unknown as PrismaClient;
}
