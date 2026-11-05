import type { AccessMap, SessionUser } from '@sml/shared';

/** User pada request setelah lolos JwtAuthGuard, lengkap dengan hak akses per menu. */
export interface AuthUser extends SessionUser {
  access: AccessMap;
  isSuperRole: boolean;
}

export interface JwtPayload {
  sub: number;
  /** Profil database saat login; token dari database lain ditolak (login ulang setelah pindah database). */
  db?: string;
}
