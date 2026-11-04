import {
  addDays, buildBody, buildSubject, byType, categorize, htmlTable, logText, parseLog, recipientsFor, successPrefix,
  type KeperluanReminder, type ReminderSource,
} from './reminder.logic.js';

const TODAY = '2026-11-02';
let seq = 0;
const client = (over: Partial<ReminderSource> = {}): ReminderSource => ({
  id: ++seq, name: `Client ${seq}`, noPaspor: null, sponsorName: null, projectName: null, keperluanId: 1, keperluanName: 'ITAS',
  tanggalProsesSelesai: null, expiredDokumen: null, noInvoice: null, tanggalInvoice: null, epo: null, tanggalPembayaranInvoice: null, ...over,
});
const kep = (over: Partial<KeperluanReminder> = {}): KeperluanReminder => ({
  id: 1, name: 'ITAS ', reminderExpiredDokumen: 60, reminderExpired2nd: 14, reminderPembuatanInvoice: 7, reminderPembayaranInvoice: 30, reminderEpo: 0, ...over,
});
const ids = (xs: { id: number }[]) => xs.map((x) => x.id);

describe('addDays', () => {
  it('menggeser tanggal melewati bulan/tahun', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('categorize (aturan aplikasi lama: tepat hari ke-N per Keperluan)', () => {
  it('expired pertama dan ke-2 hanya untuk client yang tepat jatuh pada hari ke-N', () => {
    const tepat60 = client({ expiredDokumen: addDays(TODAY, 60) });
    const lewat60 = client({ expiredDokumen: addDays(TODAY, 59) });
    const tepat14 = client({ expiredDokumen: addDays(TODAY, 14) });
    const sudahLewat = client({ expiredDokumen: addDays(TODAY, -1) });
    const out = byType(categorize([tepat60, lewat60, tepat14, sudahLewat], [kep()], TODAY));
    expect(ids(out.EXPIRED_1)).toEqual([tepat60.id]);
    expect(ids(out.EXPIRED_2)).toEqual([tepat14.id]);
    expect(out.EXPIRED_1[0].days).toBe(60);
  });

  it('pembuatan invoice: selesai tepat N hari lalu dan belum ber-invoice', () => {
    const belum = client({ tanggalProsesSelesai: addDays(TODAY, -7) });
    const sudah = client({ tanggalProsesSelesai: addDays(TODAY, -7), noInvoice: 'SML-001' });
    const lain = client({ tanggalProsesSelesai: addDays(TODAY, -8) });
    expect(ids(byType(categorize([belum, sudah, lain], [kep()], TODAY)).INVOICE_CREATE)).toEqual([belum.id]);
  });

  it('pembayaran invoice: invoice tepat N hari lalu dan belum dibayar', () => {
    const belum = client({ tanggalInvoice: addDays(TODAY, -30), noInvoice: 'X' });
    const lunas = client({ tanggalInvoice: addDays(TODAY, -30), noInvoice: 'Y', tanggalPembayaranInvoice: TODAY });
    expect(ids(byType(categorize([belum, lunas], [kep()], TODAY)).INVOICE_PAY)).toEqual([belum.id]);
  });

  it('EPO: expired tepat N hari lagi dan EPO masih kosong', () => {
    const k = kep({ reminderEpo: 30 });
    const tanpa = client({ expiredDokumen: addDays(TODAY, 30) });
    const ada = client({ expiredDokumen: addDays(TODAY, 30), epo: 'EPO-1' });
    expect(ids(byType(categorize([tanpa, ada], [k], TODAY)).EPO)).toEqual([tanpa.id]);
  });

  it('nilai 0 di Keperluan menonaktifkan kategori itu', () => {
    const c = client({ expiredDokumen: addDays(TODAY, 60), tanggalProsesSelesai: addDays(TODAY, -7) });
    const out = byType(categorize([c], [kep({ reminderExpiredDokumen: 0, reminderPembuatanInvoice: 0 })], TODAY));
    expect(out.EXPIRED_1).toEqual([]);
    expect(out.INVOICE_CREATE).toEqual([]);
  });

  it('memakai N milik Keperluan client dan menghasilkan satu batch per kategori per Keperluan', () => {
    const k1 = kep({ id: 1, name: 'ITAS' });
    const k2 = kep({ id: 2, name: 'KITAS', reminderExpiredDokumen: 30 });
    const a = client({ keperluanId: 1, expiredDokumen: addDays(TODAY, 60) });
    const b = client({ keperluanId: 2, expiredDokumen: addDays(TODAY, 60) }); // KITAS pakai 30 → tidak masuk
    const c = client({ keperluanId: 2, expiredDokumen: addDays(TODAY, 30) });
    const d = client({ keperluanId: 2, expiredDokumen: addDays(TODAY, 30) });
    const batches = categorize([a, b, c, d], [k1, k2], TODAY).filter((x) => x.type === 'EXPIRED_1');
    expect(batches.map((x) => [x.keperluanName, ids(x.items)])).toEqual([['ITAS', [a.id]], ['KITAS', [c.id, d.id]]]);
  });

  it('batch tanpa client tidak dibuat', () => {
    expect(categorize([], [kep()], TODAY)).toEqual([]);
  });
});

describe('recipientsFor', () => {
  const r = [
    { address: 'ops@x.id', isAccounting: false },
    { address: ' ops@x.id ', isAccounting: false },
    { address: 'acc@x.id', isAccounting: true },
  ];
  it('invoice ke Accounting, lainnya ke umum; alamat ganda dibuang', () => {
    expect(recipientsFor('INVOICE_PAY', r)).toEqual(['acc@x.id']);
    expect(recipientsFor('EXPIRED_1', r)).toEqual(['ops@x.id']);
  });
  it('kelompok kosong → pakai kelompok lain', () => {
    expect(recipientsFor('INVOICE_CREATE', r.filter((x) => !x.isAccounting))).toEqual(['ops@x.id']);
  });
});

describe('teks log datalog', () => {
  it('format sama dengan aplikasi lama dan bisa diurai lagi', () => {
    const t = logText('SENT', 'INVOICE_CREATE', 'NEW ITAS 11 Bulan', 3, 'System');
    expect(t).toBe('Success Run Reminder Pembuatan Invoice NEW ITAS 11 Bulan(3 items) run by System : Y');
    expect(t.startsWith(successPrefix('INVOICE_CREATE', 'NEW ITAS 11 Bulan'))).toBe(true);
    expect(parseLog(t)).toEqual({ status: 'SENT', type: 'INVOICE_CREATE', keperluan: 'NEW ITAS 11 Bulan', itemCount: 3, by: 'System', error: null });
  });
  it('mengurai log lama, termasuk nama Keperluan berkurung dan log gagal tanpa jumlah', () => {
    expect(parseLog('Success Run Schedule Expired EPO (Exit Permit Only)(0 items) run by System : Y'))
      .toMatchObject({ status: 'SENT', type: 'EXPIRED_1', keperluan: 'EPO (Exit Permit Only)', itemCount: 0 });
    expect(parseLog('Failed Run Schedule Expired Alih Status 12 Months run by System'))
      .toMatchObject({ status: 'FAILED', type: 'EXPIRED_1', keperluan: 'Alih Status 12 Months', itemCount: null });
    expect(parseLog('Failed Run Schedule 2nd ITAS(2 items) run by roy : N - Connection refused'))
      .toMatchObject({ status: 'FAILED', type: 'EXPIRED_2', by: 'roy', error: 'Connection refused' });
    expect(parseLog('teks lain').status).toBeNull();
  });
});

describe('isi email', () => {
  it('mengganti @@Keperluan@@ dan @@ClientData@@ dari template', () => {
    expect(buildBody('Dokumen @@Keperluan@@:<br/>@@ClientData@@', 'ITAS <1>', '<table/>')).toBe('Dokumen ITAS &lt;1&gt;:<br/><table/>');
    expect(buildBody('Halo', 'ITAS', '<table/>')).toBe('Halo<br/><br/><table/>');
  });

  it('tabel memakai link ke client dan meng-escape HTML', () => {
    const html = htmlTable('EXPIRED_1', [{ ...client({ name: 'A <b>' }), days: 60 }], 'https://app.test/');
    expect(html).toContain(`href="https://app.test/clients/${seq}"`);
    expect(html).toContain('A &lt;b&gt;');
    expect(html).toContain('Expired Dokumen');
    expect(htmlTable('INVOICE_PAY', [], '')).toContain('No Invoice');
  });

  it('subject berisi Keperluan dan jumlah client', () => {
    expect(buildSubject('Reminder Expired Dokumen', 'ITAS', 2)).toBe('Reminder Expired Dokumen - ITAS (2 client)');
  });
});
