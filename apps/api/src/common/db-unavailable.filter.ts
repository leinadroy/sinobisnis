import { ArgumentsHost, Catch, Logger, ServiceUnavailableException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

// Kode error koneksi: Prisma (P1001/P1002/P1017/P2024, P2039 = error driver adapter) dan driver MariaDB/MySQL.
const PRISMA_CONN = new Set(['P1001', 'P1002', 'P1017', 'P2024']);
const CONN_PATTERN = /ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND|pool failed to retrieve a connection|Connection timeout|connection closed/i;

/** Database tidak bisa dihubungi → 503 dengan pesan jelas, bukan 500 "Internal server error". */
export function isDbUnavailable(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as { code?: unknown; message?: unknown; meta?: unknown };
  if (typeof err.code === 'string' && PRISMA_CONN.has(err.code)) return true;
  if (err.code === 'P2039' || err.code === 'P2010') {
    return CONN_PATTERN.test(`${String(err.message ?? '')} ${JSON.stringify(err.meta ?? {})}`);
  }
  return false;
}

@Catch()
export class DbUnavailableFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('Database');

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() === 'http' && isDbUnavailable(exception)) {
      this.logger.error(`Database tidak bisa dihubungi: ${String((exception as Error).message ?? '').split('\n').filter(Boolean).pop()}`);
      return super.catch(new ServiceUnavailableException('Database tidak bisa dihubungi. Cek apakah server database / VPN menyala, lalu coba lagi.'), host);
    }
    return super.catch(exception, host);
  }
}
