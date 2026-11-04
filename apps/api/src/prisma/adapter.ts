import { PrismaMariaDb } from '@prisma/adapter-mariadb';

/**
 * Driver adapter Prisma untuk MariaDB (dipakai API dan script).
 * DATABASE_URL memakai skema mysql:// (dibaca juga oleh Prisma CLI); driver mariadb memakai mariadb://.
 */
export function createAdapter(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL belum diisi di apps/api/.env.');
  return new PrismaMariaDb(url.replace(/^mysql:\/\//, 'mariadb://'));
}
