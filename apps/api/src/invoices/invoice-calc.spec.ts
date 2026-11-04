import { computeInvoiceTotals, formatInvoiceNo, taxValue, terbilang, terbilangEn } from '@sml/shared';

// Aturan hitung invoice di packages/shared (dipakai API untuk menyimpan dan web untuk total di form).
describe('formatInvoiceNo (format GeneXus CompanyInvoiceNoFormat)', () => {
  const SML = '@YY@@autonumber@/SML/@ROM@/@YYYY@';

  it('mengganti semua token', () => {
    expect(formatInvoiceNo(SML, 373, '2026-11-03')).toBe('26373/SML/XI/2026');
    expect(formatInvoiceNo('@YY@@autonumber@/RTS/@ROM@/@YYYY@', 7, '2027-01-05')).toBe('27007/RTS/I/2027');
    expect(formatInvoiceNo('INV-@YYYY@@MM@-@autonumber@', 12, '2026-02-01')).toBe('INV-202602-012');
  });

  it('nomor lebih dari 3 digit tidak dipotong', () => {
    expect(formatInvoiceNo(SML, 1234, '2026-02-01')).toBe('261234/SML/II/2026');
  });

  it('format kosong → nomor saja', () => {
    expect(formatInvoiceNo('', 5, '2026-03-01')).toBe('005');
  });

});

describe('taxValue', () => {
  it('ADDITION positif, REDUCTION negatif, dibulatkan ke rupiah', () => {
    expect(taxValue(1_000_000, { percentage: 11, type: 'ADDITION' })).toBe(110_000);
    expect(taxValue(1_000_000, { percentage: 2, type: 'REDUCTION' })).toBe(-20_000);
    expect(taxValue(333, { percentage: 11, type: 'ADDITION' })).toBe(37);
  });
});

describe('computeInvoiceTotals', () => {
  const master = [
    { id: 1, percentage: 11, type: 'ADDITION' },
    { id: 2, percentage: 2, type: 'REDUCTION' },
  ];

  it('sub total dari semua grup, pajak master memakai persentase, Other memakai nilai isian', () => {
    const r = computeInvoiceTotals(
      [{ items: [{ qty: 3, unitPrice: 2_500_000 }, { qty: 1, unitPrice: 150_000 }] }, { items: [{ qty: 2, unitPrice: 1_000_000 }] }],
      [{ taxId: 1, value: 999 }, { taxId: 2, value: 0 }, { taxId: null, value: 50_000 }],
      master,
    );
    expect(r.subTotal).toBe(9_650_000);
    expect(r.taxValues).toEqual([1_061_500, -193_000, 50_000]);
    expect(r.total).toBe(10_568_500);
  });

  it('pecahan desimal tidak menghasilkan galat floating point', () => {
    const r = computeInvoiceTotals([{ items: [{ qty: 0.1, unitPrice: 3 }, { qty: 0.2, unitPrice: 3 }] }], [], []);
    expect(r.subTotal).toBe(0.9);
    expect(r.total).toBe(0.9);
  });

  it('invoice kosong bernilai nol', () => {
    expect(computeInvoiceTotals([], [], master)).toEqual({ subTotal: 0, taxValues: [], total: 0 });
  });
});

describe('terbilang', () => {
  it('bahasa Indonesia', () => {
    expect(terbilang(0)).toBe('Nol Rupiah');
    expect(terbilang(1_500_000)).toBe('Satu Juta Lima Ratus Ribu Rupiah');
    expect(terbilang(11_111)).toBe('Sebelas Ribu Seratus Sebelas Rupiah');
    expect(terbilang(-2_000)).toBe('Minus Dua Ribu Rupiah');
  });

  it('bahasa Inggris untuk cetakan', () => {
    expect(terbilangEn(0)).toBe('Zero');
    expect(terbilangEn(1_392_812_100)).toBe('One Billion Three Hundred Ninety Two Million Eight Hundred Twelve Thousand One Hundred');
    expect(terbilangEn(15)).toBe('Fifteen');
  });
});
