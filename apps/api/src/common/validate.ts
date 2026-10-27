import { BadRequestException } from '@nestjs/common';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';

/**
 * Validasi body untuk endpoint generik (DTO dipilih saat runtime, jadi ValidationPipe global tidak bisa dipakai).
 * Aturannya sama dengan ValidationPipe global: whitelist + tolak properti asing.
 */
export async function validateBody<T extends object>(cls: ClassConstructor<T>, body: unknown, partial = false): Promise<T> {
  const obj = plainToInstance(cls, body ?? {});
  const errors = await validate(obj, { whitelist: true, forbidNonWhitelisted: true, skipMissingProperties: partial });
  if (errors.length) {
    throw new BadRequestException(errors.flatMap((e) => Object.values(e.constraints ?? {})));
  }
  return obj;
}
