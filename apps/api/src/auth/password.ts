import bcrypt from 'bcryptjs';
import { createHash, timingSafeEqual } from 'node:crypto';

/** Penanda di users.UsersSalt bahwa UsersHashedPassword berisi hash bcrypt (password diatur lewat aplikasi baru). */
export const BCRYPT_SALT = 'bcrypt';

/** Data untuk menyimpan password baru (kolom UsersHashedPassword + UsersSalt). */
export async function hashPassword(password: string) {
  return { hashedPassword: await bcrypt.hash(password, 10), salt: BCRYPT_SALT };
}

/**
 * Cocokkan password dengan user. Hash bcrypt diperiksa langsung.
 * Hash lama dari aplikasi GeneXus. Akun andi cocok dengan password + SystemSalt
 * (tanpa UsersSalt); terima juga varian dengan UsersSalt dari prosedur lama.
 */
export async function verifyPassword(user: { salt: string; hashedPassword: string }, password: string) {
  if (user.salt === BCRYPT_SALT) return bcrypt.compare(password, user.hashedPassword);
  const systemSalt = process.env.SYSTEM_SALT;
  if (!systemSalt || !/^[a-f\d]{64}$/i.test(user.hashedPassword)) return false;
  const expected = Buffer.from(user.hashedPassword, 'hex');
  const digest = (input: string) => createHash('sha256').update(input, 'utf8').digest();
  const withUserSalt = timingSafeEqual(digest(password + systemSalt + user.salt), expected);
  const withoutUserSalt = timingSafeEqual(digest(password + systemSalt), expected);
  return withUserSalt || withoutUserSalt;
}
