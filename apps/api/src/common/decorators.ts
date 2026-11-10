import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';

export const IS_PUBLIC = 'isPublic';
/** Endpoint tanpa login (mis. POST /auth/login). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ALLOW_ON_READ_ONLY = 'allowOnReadOnly';
/** Boleh dipanggil walaupun database aktif hanya-baca (tidak menulis ke database aktif, mis. login / pindah database). */
export const AllowOnReadOnly = () => SetMetadata(ALLOW_ON_READ_ONLY, true);

export const ALLOW_USERS_WRITE = 'allowUsersWrite';
/**
 * Boleh dipanggil di database hanya-baca yang punya pengecualian tabel users (DB_WRITE_USERS_<PROFIL>=1).
 * Hanya untuk endpoint yang menulis lewat `prisma.authDb` (klien khusus users) — tabel lain tetap ditolak di sana.
 */
export const AllowUsersWrite = () => SetMetadata(ALLOW_USERS_WRITE, true);

export const MENU_ACCESS = 'menuAccess';
export interface MenuAccessMeta {
  key: string;
  /** Default: GET/HEAD = view, selain itu = edit. */
  mode?: 'view' | 'edit';
}
/** Wajibkan hak akses pada key menu (lihat packages/shared/src/menu.ts). */
export const Menu = (key: string, mode?: 'view' | 'edit') => SetMetadata(MENU_ACCESS, { key, mode } satisfies MenuAccessMeta);

/** User yang sedang login (diisi JwtAuthGuard). */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
