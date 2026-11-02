// Aturan reminder tanpa akses database/SMTP, supaya bisa diuji langsung (reminder.logic.spec.ts).
import { ACCOUNTING_REMINDERS, REMINDER_DAY_LABELS, REMINDER_TYPES, type ReminderItem, type ReminderType } from '@sml/shared';

/** Data client + pengaturan reminder Keperluan-nya (null = pakai default). */
export interface ReminderSource extends Omit<ReminderItem, 'days'> {
  prosesPerpanjangan: string | null;
  tanggalPembayaranInvoice: string | null;
  invoiceId: number | null;
  reminderExpiredDokumen: number | null;
  reminderExpired2nd: number | null;
  reminderPembuatanInvoice: number | null;
  reminderPembayaranInvoice: number | null;
}

/** Default bila kolom reminder Keperluan dikosongkan (sama dengan prototipe / production). */
export const REMINDER_DEFAULTS = { expired: 60, createInvoice: 14, payInvoice: 30 };

const DAY = 86_400_000;
/** Selisih hari b − a untuk tanggal 'YYYY-MM-DD'. */
const diffDays = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10) + 'T00:00:00Z') - Date.parse(a.slice(0, 10) + 'T00:00:00Z')) / DAY);

const EPO_PATTERN = /EPO|Exit Permit/i;

/**
 * Kelompokkan client ke kategori reminder per tanggal `today`.
 * - EXPIRED_2: sisa hari ≤ reminder ke-2 (Keperluan, atau `secondDefault`); termasuk yang sudah lewat.
 * - EXPIRED_1: sisa hari ≤ reminder expired (default 60) dan belum masuk EXPIRED_2.
 *   Keduanya dilewati selama Proses Perpanjangan terisi.
 * - INVOICE_CREATE: sudah selesai diproses ≥ N hari (default 14) dan belum punya invoice.
 * - INVOICE_PAY: invoice berumur ≥ N hari (default 30) dan belum dibayar.
 * - EPO: Keperluan EPO / Exit Permit yang belum selesai diproses.
 * Nilai reminder 0 menonaktifkan kategori invoice untuk Keperluan itu.
 */
export function categorize(rows: ReminderSource[], today: string, secondDefault: number): Record<ReminderType, ReminderItem[]> {
  const out = Object.fromEntries(REMINDER_TYPES.map((t) => [t, [] as ReminderItem[]])) as Record<ReminderType, ReminderItem[]>;
  const item = (r: ReminderSource, days: number | null): ReminderItem => ({
    id: r.id, name: r.name, noPaspor: r.noPaspor, sponsorName: r.sponsorName, projectName: r.projectName, keperluanName: r.keperluanName,
    tanggalProsesSelesai: r.tanggalProsesSelesai, expiredDokumen: r.expiredDokumen, noInvoice: r.noInvoice, tanggalInvoice: r.tanggalInvoice, days,
  });

  for (const r of rows) {
    if (r.expiredDokumen && !r.prosesPerpanjangan?.trim()) {
      const left = diffDays(today, r.expiredDokumen);
      const second = r.reminderExpired2nd ?? secondDefault;
      const first = r.reminderExpiredDokumen ?? REMINDER_DEFAULTS.expired;
      if (left <= second) out.EXPIRED_2.push(item(r, left));
      else if (left <= first) out.EXPIRED_1.push(item(r, left));
    }

    const hasInvoice = Boolean(r.invoiceId || r.noInvoice?.trim());
    if (r.tanggalProsesSelesai && !hasInvoice) {
      const since = diffDays(r.tanggalProsesSelesai, today);
      const limit = r.reminderPembuatanInvoice ?? REMINDER_DEFAULTS.createInvoice;
      if (limit > 0 && since >= limit) out.INVOICE_CREATE.push(item(r, since));
    }

    if (r.tanggalInvoice && !r.tanggalPembayaranInvoice) {
      const since = diffDays(r.tanggalInvoice, today);
      const limit = r.reminderPembayaranInvoice ?? REMINDER_DEFAULTS.payInvoice;
      if (limit > 0 && since >= limit) out.INVOICE_PAY.push(item(r, since));
    }

    if (EPO_PATTERN.test(r.keperluanName ?? '') && !r.tanggalProsesSelesai) out.EPO.push(item(r, null));
  }

  // Yang paling mendesak di atas.
  out.EXPIRED_2.sort((a, b) => a.days! - b.days!);
  out.EXPIRED_1.sort((a, b) => a.days! - b.days!);
  out.INVOICE_CREATE.sort((a, b) => b.days! - a.days!);
  out.INVOICE_PAY.sort((a, b) => b.days! - a.days!);
  return out;
}

export interface Recipient {
  email: string;
  type: 'TO' | 'CC' | 'BCC';
  isAccounting: boolean;
}

/**
 * Penerima per kategori: reminder invoice → penerima Accounting, lainnya → penerima umum.
 * Bila kelompok itu belum punya penerima TO, dipakai kelompok lainnya.
 */
export function recipientsFor(type: ReminderType, recips: Recipient[]) {
  const forAccounting = ACCOUNTING_REMINDERS.includes(type);
  let list = recips.filter((r) => r.isAccounting === forAccounting);
  if (!list.some((r) => r.type === 'TO')) list = recips.filter((r) => r.isAccounting !== forAccounting);
  const pick = (t: Recipient['type']) => [...new Set(list.filter((r) => r.type === t).map((r) => r.email))];
  return { to: pick('TO'), cc: pick('CC'), bcc: pick('BCC') };
}

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
/** 'YYYY-MM-DD' → '02 Nov 2026'. */
export function fmtDate(s: string | null | undefined): string {
  if (!s) return '';
  const [y, m, d] = s.slice(0, 10).split('-');
  return `${d} ${BULAN[Number(m) - 1]} ${y}`;
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Tabel HTML daftar client untuk isi email (inline style supaya tampil rapi di klien email). */
export function htmlTable(type: ReminderType, items: ReminderItem[], siteUrl: string): string {
  const dayLabel = REMINDER_DAY_LABELS[type];
  const site = siteUrl.replace(/\/+$/, '');
  const th = 'style="border:1px solid #ccc;padding:4px 8px;background:#003a80;color:#fff;text-align:left"';
  const td = 'style="border:1px solid #ccc;padding:4px 8px"';
  const head = ['No', 'Sponsor', 'Project', 'Nama', 'No Paspor', 'Keperluan', 'Expired', 'No Invoice', ...(dayLabel ? [dayLabel] : [])];
  const rows = items.map((r) => {
    const no = site ? `<a href="${esc(`${site}/clients/${r.id}`)}">${r.id}</a>` : String(r.id);
    const cells = [no, esc(r.sponsorName), esc(r.projectName), esc(r.name), esc(r.noPaspor), esc(r.keperluanName), fmtDate(r.expiredDokumen), esc(r.noInvoice),
      ...(dayLabel ? [String(r.days ?? '')] : [])];
    return `<tr>${cells.map((c) => `<td ${td}>${c}</td>`).join('')}</tr>`;
  });
  return `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px"><tr>${head.map((h) => `<th ${th}>${esc(h)}</th>`).join('')}</tr>${rows.join('')}</table>`;
}

/** Subject email: subject template + jumlah client + tanggal. */
export const buildSubject = (base: string, count: number, today: string) => `${base} (${count} client) - ${fmtDate(today)}`;
