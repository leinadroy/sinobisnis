import { describe, expect, it } from 'vitest';
import { BCRYPT_SALT, legacyHash, legacySystemSalt, passwordFormat, verifyLegacyPassword } from './password.js';

// Nilai contoh saja — BUKAN SystemSalt asli (itu rahasia, hanya di apps/api/.env).
// Hash pembanding dihitung terpisah dengan Python hashlib.sha256((pwd + sys + usr).encode('utf-8')).hexdigest().upper().
const SYS = 'SYS';
const USR = 'USR';
const HASH = '26D546DC55F93EA8B143DAB80AAF2CA8D2515F3D729346126A0B71B07904EF17';
const SYS64 = 'AB'.repeat(32);
const USR64 = 'cd'.repeat(32);
const HASH_UNICODE = 'ACAE580010A155051A714DA90513F393E3646845ED039C855674DEB1FAD9A702';

describe('legacyHash (rumus GeneXus)', () => {
  it('SHA-256 dari password + SystemSalt + UsersSalt, hex huruf besar', () => {
    expect(legacyHash('rahasia123', SYS, USR)).toBe(HASH);
  });

  it('password non-ASCII di-encode UTF-8', () => {
    expect(legacyHash('pässwörd', SYS64, USR64)).toBe(HASH_UNICODE);
  });

  it('urutan penting: SystemSalt sebelum UsersSalt', () => {
    expect(legacyHash('rahasia123', USR, SYS)).not.toBe(HASH);
  });
});

describe('verifyLegacyPassword', () => {
  const user = { salt: USR64, hashedPassword: HASH_UNICODE };

  it('cocok untuk password benar', () => {
    expect(verifyLegacyPassword(user, 'pässwörd', SYS64)).toBe(true);
  });

  it('hash tersimpan huruf kecil / ada spasi tetap cocok', () => {
    expect(verifyLegacyPassword({ salt: ` ${USR64} `, hashedPassword: ` ${HASH_UNICODE.toLowerCase()} ` }, 'pässwörd', SYS64)).toBe(true);
  });

  it('password salah, SystemSalt salah, atau SystemSalt kosong → tidak cocok', () => {
    expect(verifyLegacyPassword(user, 'passwörd', SYS64)).toBe(false);
    expect(verifyLegacyPassword(user, 'pässwörd', 'X'.repeat(64))).toBe(false);
    expect(verifyLegacyPassword(user, 'pässwörd', '')).toBe(false);
  });

  it('user bcrypt tidak pernah dicek dengan rumus GeneXus', () => {
    expect(verifyLegacyPassword({ salt: BCRYPT_SALT, hashedPassword: HASH_UNICODE }, 'pässwörd', SYS64)).toBe(false);
  });
});

describe('passwordFormat & legacySystemSalt', () => {
  it('membedakan bcrypt, legacy, dan bentuk lain', () => {
    expect(passwordFormat({ salt: BCRYPT_SALT, hashedPassword: '$2a$10$x' })).toBe('bcrypt');
    expect(passwordFormat({ salt: USR64, hashedPassword: HASH })).toBe('legacy');
    expect(passwordFormat({ salt: '', hashedPassword: HASH })).toBe('unknown');
    expect(passwordFormat({ salt: USR64, hashedPassword: 'abc' })).toBe('unknown');
  });

  it('SystemSalt dibaca dari LEGACY_SYSTEM_SALT', () => {
    expect(legacySystemSalt({ LEGACY_SYSTEM_SALT: '  abc  ' })).toBe('abc');
    expect(legacySystemSalt({})).toBe('');
  });
});
