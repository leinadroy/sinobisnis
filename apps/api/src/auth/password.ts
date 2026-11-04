import bcrypt from 'bcryptjs';

/** Penanda di users.UsersSalt bahwa UsersHashedPassword berisi hash bcrypt (password diatur lewat aplikasi baru). */
export const BCRYPT_SALT = 'bcrypt';

/** Data untuk menyimpan password baru (kolom UsersHashedPassword + UsersSalt). */
export async function hashPassword(password: string) {
  return { hashedPassword: await bcrypt.hash(password, 10), salt: BCRYPT_SALT };
}

/**
 * Cocokkan password dengan user. Hash bcrypt diperiksa langsung.
 * Hash GeneXus aplikasi lama (UsersSalt 64 hex + UsersHashedPassword 64 hex) belum bisa diverifikasi karena algoritmanya
 * belum diketahui — user lama perlu diberi password baru oleh admin (Security → Users) atau lewat
 * `npm run user:password -- <username>`.
 */
export async function verifyPassword(user: { salt: string; hashedPassword: string }, password: string) {
  if (user.salt === BCRYPT_SALT) return bcrypt.compare(password, user.hashedPassword);
  return false;
}
