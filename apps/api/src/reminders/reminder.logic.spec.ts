import { buildSubject, categorize, htmlTable, recipientsFor, type ReminderSource } from './reminder.logic.js';

const TODAY = '2026-11-02';
let seq = 0;
const client = (over: Partial<ReminderSource> = {}): ReminderSource => ({
  id: ++seq, name: `Client ${seq}`, noPaspor: null, sponsorName: null, projectName: null, keperluanName: 'ITAS',
  tanggalProsesSelesai: null, expiredDokumen: null, noInvoice: null, tanggalInvoice: null, prosesPerpanjangan: null,
  tanggalPembayaranInvoice: null, invoiceId: null, reminderExpiredDokumen: null, reminderExpired2nd: null,
  reminderPembuatanInvoice: null, reminderPembayaranInvoice: null, ...over,
});
const ids = (xs: { id: number }[]) => xs.map((x) => x.id);

describe('categorize', () => {
  it('expired: ke-2 (termasuk lewat) vs pertama, default 60 hari, diurutkan paling mendesak', () => {
    const lewat = client({ expiredDokumen: '2026-10-30' });
    const dekat = client({ expiredDokumen: '2026-11-12' });
    const sedang = client({ expiredDokumen: '2026-12-20' });
    const jauh = client({ expiredDokumen: '2027-03-01' });
    const r = categorize([sedang, jauh, dekat, lewat], TODAY, 14);
    expect(ids(r.EXPIRED_2)).toEqual([lewat.id, dekat.id]);
    expect(r.EXPIRED_2.map((x) => x.days)).toEqual([-3, 10]);
    expect(ids(r.EXPIRED_1)).toEqual([sedang.id]);
  });

  it('expired: memakai hari reminder Keperluan dan dilewati selama proses perpanjangan', () => {
    const custom = client({ expiredDokumen: '2026-11-25', reminderExpired2nd: 30 });
    const diperpanjang = client({ expiredDokumen: '2026-11-03', prosesPerpanjangan: 'Sedang diproses' });
    const r = categorize([custom, diperpanjang], TODAY, 14);
    expect(ids(r.EXPIRED_2)).toEqual([custom.id]);
    expect(r.EXPIRED_1).toEqual([]);
  });

  it('belum invoice: selesai ≥ 14 hari, tanpa invoice; 0 = nonaktif', () => {
    const lama = client({ tanggalProsesSelesai: '2026-10-01' });
    const baru = client({ tanggalProsesSelesai: '2026-10-25' });
    const sudah = client({ tanggalProsesSelesai: '2026-10-01', invoiceId: 9 });
    const manual = client({ tanggalProsesSelesai: '2026-10-01', noInvoice: '0001/SML/X/2026' });
    const off = client({ tanggalProsesSelesai: '2026-01-01', reminderPembuatanInvoice: 0 });
    const r = categorize([lama, baru, sudah, manual, off], TODAY, 14);
    expect(ids(r.INVOICE_CREATE)).toEqual([lama.id]);
    expect(r.INVOICE_CREATE[0].days).toBe(32);
  });

  it('belum bayar: invoice ≥ 30 hari tanpa tanggal pembayaran', () => {
    const telat = client({ tanggalInvoice: '2026-09-01' });
    const lunas = client({ tanggalInvoice: '2026-09-01', tanggalPembayaranInvoice: '2026-09-20' });
    const baru = client({ tanggalInvoice: '2026-10-20' });
    expect(ids(categorize([telat, lunas, baru], TODAY, 14).INVOICE_PAY)).toEqual([telat.id]);
  });

  it('EPO: keperluan EPO / Exit Permit yang belum selesai', () => {
    const a = client({ keperluanName: 'EPO (Exit Permit Only)' });
    const b = client({ keperluanName: 'Exit Permit' });
    const selesai = client({ keperluanName: 'EPO', tanggalProsesSelesai: '2026-10-01' });
    const r = categorize([a, b, selesai, client()], TODAY, 14);
    expect(ids(r.EPO)).toEqual([a.id, b.id]);
  });
});

describe('recipientsFor', () => {
  const recips = [
    { email: 'ops@x.id', type: 'TO' as const, isAccounting: false },
    { email: 'boss@x.id', type: 'CC' as const, isAccounting: false },
    { email: 'fin@x.id', type: 'TO' as const, isAccounting: true },
    { email: 'audit@x.id', type: 'BCC' as const, isAccounting: true },
  ];

  it('dokumen → umum, invoice → accounting', () => {
    expect(recipientsFor('EXPIRED_1', recips)).toEqual({ to: ['ops@x.id'], cc: ['boss@x.id'], bcc: [] });
    expect(recipientsFor('INVOICE_PAY', recips)).toEqual({ to: ['fin@x.id'], cc: [], bcc: ['audit@x.id'] });
  });

  it('fallback ke kelompok lain bila tidak ada TO', () => {
    const onlyGeneral = recips.filter((r) => !r.isAccounting);
    expect(recipientsFor('INVOICE_CREATE', onlyGeneral).to).toEqual(['ops@x.id']);
    expect(recipientsFor('EPO', []).to).toEqual([]);
  });
});

describe('email', () => {
  it('tabel meng-escape HTML dan memberi link ke client', () => {
    const html = htmlTable('EXPIRED_2', [{
      id: 7, name: '<b>Wang</b> & Li', noPaspor: 'E123', sponsorName: null, projectName: null, keperluanName: 'ITAS',
      tanggalProsesSelesai: null, expiredDokumen: '2026-11-12', noInvoice: null, tanggalInvoice: null, days: 10,
    }], 'https://app.example.com/');
    expect(html).toContain('&lt;b&gt;Wang&lt;/b&gt; &amp; Li');
    expect(html).toContain('href="https://app.example.com/clients/7"');
    expect(html).toContain('12 Nov 2026');
    expect(html).toContain('Sisa Hari');
  });

  it('subject berisi jumlah dan tanggal', () => {
    expect(buildSubject('Reminder EPO', 3, TODAY)).toBe('Reminder EPO (3 client) - 02 Nov 2026');
  });
});
