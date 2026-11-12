import { isDbUnavailable } from './db-unavailable.filter.js';

describe('isDbUnavailable', () => {
  it('pool/ECONNREFUSED dari driver adapter (P2039) → database mati', () => {
    const e = Object.assign(new Error('Database error. Code: `45028`. Message: `pool failed to retrieve a connection from pool`'), {
      code: 'P2039', meta: { modelName: 'User', driverAdapterError: { cause: { cause: 'connect ECONNREFUSED ::1:3306' } } },
    });
    expect(isDbUnavailable(e)).toBe(true);
  });
  it('kode koneksi Prisma → database mati', () => {
    expect(isDbUnavailable({ code: 'P1001', message: "Can't reach database server" })).toBe(true);
  });
  it('error data biasa tetap error biasa', () => {
    expect(isDbUnavailable({ code: 'P2002', message: 'Unique constraint failed' })).toBe(false);
    expect(isDbUnavailable({ code: 'P2039', message: 'Duplicate entry', meta: {} })).toBe(false);
    expect(isDbUnavailable(new Error('boom'))).toBe(false);
  });
});
