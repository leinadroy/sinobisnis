import { computeExpired, periodUnit } from '@sml/shared';

// Expired Dokumen otomatis = tanggal sumber + periode Keperluan (packages/shared/src/client.ts).
describe('periode Keperluan', () => {
  it('Periode In terisi dipakai apa adanya (termasuk "DAYS\\t" data lama)', () => {
    expect(periodUnit(60, 'DAYS')).toBe('DAYS');
    expect(periodUnit(60, 'DAYS\t')).toBe('DAYS');
    expect(periodUnit(12, 'MONTHS')).toBe('MONTHS');
  });

  it('Periode In kosong: ≥ 30 = hari, < 30 = bulan', () => {
    expect(periodUnit(60, null)).toBe('DAYS');
    expect(periodUnit(30, '')).toBe('DAYS');
    expect(periodUnit(180, null)).toBe('DAYS');
    expect(periodUnit(12, null)).toBe('MONTHS');
    expect(periodUnit(24, null)).toBe('MONTHS');
  });

  it('tanggal terbit + 60 hari (bukan 60 bulan)', () => {
    const k = { periode: 60, periodeIn: periodUnit(60, null), sumberData: 'TANGGAL TERBIT DOKUMEN' };
    expect(computeExpired({ tanggalTerbitDokumen: '2026-11-17' }, k)).toBe('2027-01-16');
  });
});
