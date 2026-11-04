import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs';
import { Prisma } from '../generated/prisma/client.js';

/**
 * Ubah Prisma.Decimal dan BigInt menjadi number di semua response (ID & nominal rupiah jauh di bawah 2^53).
 */
function convert(value: unknown): unknown {
  if (value instanceof Prisma.Decimal) return value.toNumber();
  if (typeof value === 'bigint') return Number(value);
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(convert);
  // Hanya objek polos (bukan Date, StreamableFile, Buffer, dll.).
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, convert(v)]));
}

@Injectable()
export class SerializeInterceptor implements NestInterceptor {
  intercept(_: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(map(convert));
  }
}
