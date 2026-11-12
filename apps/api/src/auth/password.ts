import { createHash, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';

/** Penanda di users.UsersSalt bahwa UsersHashedPassword berisi hash bcrypt (password diatur lewat aplikasi baru). */
export const BCRYPT_SALT = 'bcrypt';

/** Data untuk menyimpan password baru (kolom UsersHashedPassword + UsersSalt). */
export async function hashPassword(password: string) {
  return { hashedPassword: await bcrypt.hash(password, 10), salt: BCRYPT_SALT };
}

/**
 * Cocokkan password dengan user (login & ganti password):
 * - bcrypt (UsersSalt = 'bcrypt'): password yang diatur lewat aplikasi baru;
 * - hash GeneXus aplikasi lama (UsersSalt + UsersHashedPassword 64 hex) dengan rumus verifyLegacyPassword — hanya bila
 *   LEGACY_SYSTEM_SALT diisi di apps/api/.env. Hash lama TIDAK diubah ke bcrypt saat login, supaya user tetap bisa login
 *   di aplikasi GeneXus yang masih dipakai (bcrypt tidak bisa dibaca aplikasi lama).
 */
export async function verifyPassword(user: { salt: string; hashedPassword: string }, password: string, systemSalt = legacySystemSalt()) {
  if (user.salt === BCRYPT_SALT) return bcrypt.compare(password, user.hashedPassword);
  return verifyLegacyPassword(user, password, systemSalt);
}

// ---------------------------------------------------------------- Hash GeneXus aplikasi lama

/** SystemSalt GeneXus (rahasia, satu untuk semua user) dari apps/api/.env — repo ini publik, jangan tulis di kode. */
export const legacySystemSalt = (env: NodeJS.ProcessEnv = process.env) => env.LEGACY_SYSTEM_SALT?.trim() ?? '';

/** Bentuk password user: bcrypt (aplikasi baru), legacy (GeneXus: salt + hash SHA-256 64 hex), atau lainnya. */
export function passwordFormat(user: { salt: string; hashedPassword: string }): 'bcrypt' | 'legacy' | 'unknown' {
  if (user.salt === BCRYPT_SALT) return 'bcrypt';
  if (user.salt.trim() && /^[0-9a-f]{64}$/i.test(user.hashedPassword.trim())) return 'legacy';
  return 'unknown';
}

/** Rumus GeneXus: SHA-256(UTF-8 password + SystemSalt + UsersSalt), hex huruf besar. */
export function legacyHash(password: string, systemSalt: string, userSalt: string) {
  return createHash('sha256').update(`${password}${systemSalt}${userSalt}`, 'utf8').digest('hex').toUpperCase();
}

/** Cocokkan password dengan hash GeneXus (tanpa beda huruf besar/kecil, waktu konstan). */
export function verifyLegacyPassword(user: { salt: string; hashedPassword: string }, password: string, systemSalt: string) {
  if (!systemSalt || passwordFormat(user) !== 'legacy') return false;
  const a = Buffer.from(legacyHash(password, systemSalt, user.salt.trim()), 'utf8');
  const b = Buffer.from(user.hashedPassword.trim().toUpperCase(), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
