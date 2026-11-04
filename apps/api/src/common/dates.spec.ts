import { d2s, dt2s, s2d, s2gx } from './dates.js';

describe('dates', () => {
  it('kolom DATE: string ↔ Date tanpa geser zona waktu', () => {
    expect(d2s(s2d('2026-11-04'))).toBe('2026-11-04');
    expect(d2s(new Date('1000-01-01T00:00:00Z'))).toBeNull();
    expect(s2gx(null).toISOString()).toBe('1000-01-01T00:00:00.000Z');
  });

  it('DATETIME (UTC) → ISO, kosong → null', () => {
    expect(dt2s(new Date('2026-11-04T00:00:30Z'))).toBe('2026-11-04T00:00:30.000Z');
    expect(dt2s(new Date('1000-01-01T00:00:00Z'))).toBeNull();
    expect(dt2s(null)).toBeNull();
  });
});
