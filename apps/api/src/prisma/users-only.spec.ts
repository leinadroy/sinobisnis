import { assertUsersOnly, UsersOnlyViolation } from './users-only.js';

describe('users-only (pengecualian tabel users di database hanya-baca)', () => {
  it('baca boleh di semua tabel (role & hak akses ikut dibaca saat login)', () => {
    for (const op of ['findUnique', 'findFirst', 'findMany', 'count', 'aggregate', 'groupBy']) {
      expect(() => assertUsersOnly('Role', op, {})).not.toThrow();
      expect(() => assertUsersOnly('Invoice', op, {})).not.toThrow();
    }
  });

  it('tulis hanya user.create / user.update dengan nilai kolom biasa', () => {
    expect(() => assertUsersOnly('User', 'update', { where: { id: 1 }, data: { lastLogin: new Date(), salt: 'bcrypt', isActive: true, roleId: 3, email: null } })).not.toThrow();
    expect(() => assertUsersOnly('User', 'create', { data: { username: 'x', fullname: 'X', roleId: 3 } })).not.toThrow();
  });

  it('tabel lain, hapus, upsert, *Many dan SQL mentah ditolak', () => {
    const denied: [string | undefined, string][] = [
      ['Client', 'update'], ['Invoice', 'create'], ['UserCookie', 'deleteMany'], ['DataLog', 'create'], ['RolePgmname', 'update'],
      ['User', 'delete'], ['User', 'deleteMany'], ['User', 'updateMany'], ['User', 'createMany'], ['User', 'upsert'],
      [undefined, '$executeRaw'], [undefined, '$executeRawUnsafe'], [undefined, '$queryRaw'], [undefined, '$queryRawUnsafe'],
    ];
    for (const [model, op] of denied) expect(() => assertUsersOnly(model, op, { data: { a: 1 } })).toThrow(UsersOnlyViolation);
  });

  it('nested write lewat user.update ke tabel lain ditolak', () => {
    expect(() => assertUsersOnly('User', 'update', { where: { id: 1 }, data: { cookies: { deleteMany: {} } } })).toThrow(/bertingkat "cookies"/);
    expect(() => assertUsersOnly('User', 'update', { where: { id: 1 }, data: { role: { update: { name: 'x' } } } })).toThrow(UsersOnlyViolation);
    expect(() => assertUsersOnly('User', 'create', { data: { username: 'x', conversations: { create: [] } } })).toThrow(UsersOnlyViolation);
    expect(() => assertUsersOnly('User', 'update', { where: { id: 1 } })).toThrow(/tanpa data/);
  });
});
