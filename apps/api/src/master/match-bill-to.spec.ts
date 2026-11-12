import { describe, expect, it } from 'vitest';
import { billToOptions, matchBillTo } from './master.service.js';

const bt = (id: number, companyName: string, kodePerusahaan = '', npwp = '') => ({ id, companyName, kodePerusahaan, npwp });
// Seperti staging: dua Bill To bernama sama, kode SCL juga dipakai dua Bill To.
const billTos = [bt(10, 'Sinohydro Corporation Limited', 'SCL', '0020721924053000'), bt(75, 'Sinohydro Corporation Limited'), bt(248, 'Sinohydro PII Nem Consortium', 'SCL'), bt(21, 'Sinohydro-Adhi Jo')];
const pohuwato = { companyName: 'Sinohydro Corporation Limited', npwp: '', kodePerusahaan: 'SCL', sponsorId: 76 };

describe('matchBillTo', () => {
  it('satu nama cocok → langsung dipakai', () => {
    expect(matchBillTo({ ...pohuwato, companyName: 'Sinohydro-Adhi JO' }, billTos)).toBe(21);
  });

  it('nama dobel tanpa riwayat invoice → null (dipilih manual)', () => {
    expect(matchBillTo(pohuwato, billTos)).toBeNull();
    expect(matchBillTo(pohuwato, billTos, new Map())).toBeNull();
  });

  it('nama dobel → Bill To yang terakhir dipakai sponsor itu', () => {
    const usage = new Map([['76:10', 100], ['76:75', 200], ['5:10', 999]]);
    expect(matchBillTo(pohuwato, billTos, usage)).toBe(75);
  });

  it('riwayat sponsor lain tidak dihitung', () => {
    expect(matchBillTo(pohuwato, billTos, new Map([['5:10', 999]]))).toBeNull();
  });

  it('nama tidak terpecahkan → lanjut ke NPWP', () => {
    expect(matchBillTo({ ...pohuwato, npwp: '0020721924053000' }, billTos, new Map())).toBe(10);
  });
});

describe('billToOptions', () => {
  it('nama dobel diberi pembeda, nama unik tidak', () => {
    const labels = billToOptions(billTos).map((o) => o.label);
    expect(labels).toEqual([
      'Sinohydro Corporation Limited (SCL · NPWP 0020721924053000 · #10)',
      'Sinohydro Corporation Limited (#75)',
      'Sinohydro PII Nem Consortium',
      'Sinohydro-Adhi Jo',
    ]);
  });
});
