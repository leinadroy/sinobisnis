// Aturan reminder tanpa akses database/SMTP, supaya bisa diuji langsung (reminder.logic.spec.ts).
// Sama dengan aplikasi lama (dicek terhadap log reminder di datalog): per Keperluan, hanya client yang TEPAT jatuh pada
// hari ke-N; N diambil dari kolom Reminder di Keperluan dan 0 berarti kategori itu nonaktif untuk Keperluan tersebut.
import {
  ACCOUNTING_REMINDERS, REMINDER_LOG_PREFIX, REMINDER_TYPES,
  type ReminderItem, type ReminderRunStatus, type ReminderType,
} from '@sml/shared';

/** Data client untuk reminder (tanggal 'YYYY-MM-DD' atau null). */
export interface ReminderSource extends Omit<ReminderItem, 'days'> {
  epo: string | null;
  tanggalPembayaranInvoice: string | null;
}

/** Pengaturan reminder satu Keperluan (kolom Reminder* tabel keperluan). */
export interface KeperluanReminder {
  id: number;
  name: string;
  reminderExpiredDokumen: number;
  reminderExpired2nd: number;
  reminderPembuatanInvoice: number;
  reminderPembayaranInvoice: number;
  reminderEpo: number;
}

const DAY = 86_400_000;
/** Selisih hari b − a untuk tanggal 'YYYY-MM-DD'. */
export const diffDays = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10) + 'T00:00:00Z') - Date.parse(a.slice(0, 10) + 'T00:00:00Z')) / DAY);
/** Tanggal 'YYYY-MM-DD' digeser n hari. */
export const addDays = (d: string, n: number) => new Date(Date.parse(d.slice(0, 10) + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);

const blank = (s: string | null | undefined) => !s?.trim();

/** Nilai hari ke-N per kategori untuk satu Keperluan (0 = nonaktif). */
export function daysFor(type: ReminderType, k: KeperluanReminder): number {
  switch (type) {
    case 'EXPIRED_1': return k.reminderExpiredDokumen;
    case 'EXPIRED_2': return k.reminderExpired2nd;
    case 'INVOICE_CREATE': return k.reminderPembuatanInvoice;
    case 'INVOICE_PAY': return k.reminderPembayaranInvoice;
    case 'EPO': return k.reminderEpo;
  }
}

/** Apakah client masuk kategori `type` pada `today`, dengan N = `n` hari. */
export function matches(type: ReminderType, r: ReminderSource, n: number, today: string): boolean {
  if (n <= 0) return false;
  switch (type) {
    case 'EXPIRED_1':
    case 'EXPIRED_2':
      return r.expiredDokumen === addDays(today, n);
    case 'EPO':
      return r.expiredDokumen === addDays(today, n) && blank(r.epo);
    case 'INVOICE_CREATE':
      // Aplikasi lama tidak memeriksa invoice; di sini client yang sudah ber-invoice tidak diingatkan lagi.
      return r.tanggalProsesSelesai === addDays(today, -n) && blank(r.noInvoice);
    case 'INVOICE_PAY':
      return r.tanggalInvoice === addDays(today, -n) && !r.tanggalPembayaranInvoice;
  }
}

/** Satu email: kategori + Keperluan + daftar client. */
export interface ReminderBatch {
  type: ReminderType;
  keperluanId: number;
  keperluanName: string;
  days: number;
  items: ReminderItem[];
}

/** Kelompokkan client per kategori dan Keperluan pada tanggal `today`. Batch tanpa client tidak ikut. */
export function categorize(rows: ReminderSource[], keperluan: KeperluanReminder[], today: string): ReminderBatch[] {
  const byKep = new Map<number, ReminderSource[]>();
  for (const r of rows) {
    const list = byKep.get(r.keperluanId);
    if (list) list.push(r);
    else byKep.set(r.keperluanId, [r]);
  }
  const out: ReminderBatch[] = [];
  for (const type of REMINDER_TYPES) {
    for (const k of keperluan) {
      const n = daysFor(type, k);
      if (n <= 0) continue;
      const items = (byKep.get(k.id) ?? []).filter((r) => matches(type, r, n, today)).map((r) => ({ ...withoutExtra(r), days: n }));
      if (items.length) out.push({ type, keperluanId: k.id, keperluanName: k.name.trim(), days: n, items });
    }
  }
  return out;
}

function withoutExtra(r: ReminderSource): Omit<ReminderItem, 'days'> {
  const { epo: _epo, tanggalPembayaranInvoice: _paid, ...rest } = r;
  return rest;
}

/** Batch dijadikan daftar per kategori (untuk halaman Email Reminder). */
export function byType(batches: ReminderBatch[]): Record<ReminderType, ReminderItem[]> {
  const out = Object.fromEntries(REMINDER_TYPES.map((t) => [t, [] as ReminderItem[]])) as Record<ReminderType, ReminderItem[]>;
  for (const b of batches) out[b.type].push(...b.items);
  for (const t of REMINDER_TYPES) out[t].sort((a, b) => (a.keperluanName ?? '').localeCompare(b.keperluanName ?? '') || a.name.localeCompare(b.name));
  return out;
}

export interface Recipient {
  address: string;
  isAccounting: boolean;
}

/** Reminder invoice → penerima Accounting, lainnya → penerima umum; bila kelompok itu kosong dipakai kelompok lainnya. */
export function recipientsFor(type: ReminderType, recips: Recipient[]): string[] {
  const forAccounting = ACCOUNTING_REMINDERS.includes(type);
  const clean = (list: Recipient[]) => [...new Set(list.map((r) => r.address.trim()).filter(Boolean))];
  const own = clean(recips.filter((r) => r.isAccounting === forAccounting));
  return own.length ? own : clean(recips.filter((r) => r.isAccounting !== forAccounting));
}

// ───────────────────────── Teks log (datalog, format aplikasi lama) ─────────────────────────

const STATUS_WORD: Record<Exclude<ReminderRunStatus, 'SKIPPED'>, string> = { SENT: 'Success', FAILED: 'Failed', 'NOT SENT': 'Not Sent' };

/** "Success Run Reminder Pembuatan Invoice NEW ITAS 11 Bulan(3 items) run by System : Y". */
export function logText(status: Exclude<ReminderRunStatus, 'SKIPPED'>, type: ReminderType, keperluan: string, count: number, by: string, note?: string | null) {
  const base = `${STATUS_WORD[status]} Run ${REMINDER_LOG_PREFIX[type]} ${keperluan}(${count} items) run by ${by} : ${status === 'SENT' ? 'Y' : 'N'}`;
  return (note ? `${base} - ${note}` : base).slice(0, 5000);
}

export interface ParsedLog {
  status: 'SENT' | 'FAILED' | 'NOT SENT' | null;
  type: ReminderType | null;
  keperluan: string | null;
  itemCount: number | null;
  by: string | null;
  error: string | null;
}

const LOG_RE = /^(Success|Failed|Not Sent) Run (Schedule Expired|Schedule 2nd|Reminder Pembuatan Invoice|Reminder Pembayaran Invoice|Schedule EPO) (.*?)(?:\((\d+) items\))?\s*run by (.*?)(?: : [YN])?(?: - (.*))?$/s;
const TYPE_BY_PREFIX = Object.fromEntries(Object.entries(REMINDER_LOG_PREFIX).map(([t, p]) => [p, t])) as Record<string, ReminderType>;

/** Uraikan teks log lama/baru; bagian yang tidak dikenali bernilai null. */
export function parseLog(text: string): ParsedLog {
  const m = LOG_RE.exec(text);
  if (!m) return { status: null, type: null, keperluan: null, itemCount: null, by: null, error: null };
  const status = m[1] === 'Success' ? 'SENT' : m[1] === 'Failed' ? 'FAILED' : 'NOT SENT';
  return {
    status, type: TYPE_BY_PREFIX[m[2]] ?? null, keperluan: m[3].trim() || null,
    itemCount: m[4] === undefined ? null : Number(m[4]), by: m[5].trim() || null, error: m[6]?.trim() || null,
  };
}

/** Awalan teks log sukses untuk satu kategori + Keperluan (dipakai mencegah kirim dua kali sehari). */
export const successPrefix = (type: ReminderType, keperluan: string) => `Success Run ${REMINDER_LOG_PREFIX[type]} ${keperluan}(`;

// ───────────────────────── Isi email ─────────────────────────

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
/** 'YYYY-MM-DD' → '02 Nov 2026'. */
export function fmtDate(s: string | null | undefined): string {
  if (!s) return '';
  const [y, m, d] = s.slice(0, 10).split('-');
  return `${d} ${BULAN[Number(m) - 1]} ${y}`;
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Tabel HTML daftar client untuk @@ClientData@@ (inline style supaya rapi di klien email). */
export function htmlTable(type: ReminderType, items: ReminderItem[], siteUrl: string): string {
  const site = siteUrl.trim().replace(/\/+$/, '');
  const th = 'style="border:1px solid #ccc;padding:4px 8px;background:#003a80;color:#fff;text-align:left"';
  const td = 'style="border:1px solid #ccc;padding:4px 8px"';
  const invoiceCols = type === 'INVOICE_CREATE' || type === 'INVOICE_PAY';
  const head = ['No', 'Sponsor', 'Project', 'Nama', 'No Paspor',
    ...(invoiceCols ? ['Proses Selesai', 'No Invoice', 'Tgl Invoice'] : ['Expired Dokumen'])];
  const rows = items.map((r, i) => {
    const name = site ? `<a href="${esc(`${site}/clients/${r.id}`)}">${esc(r.name)}</a>` : esc(r.name);
    const cells = [String(i + 1), esc(r.sponsorName), esc(r.projectName), name, esc(r.noPaspor),
      ...(invoiceCols ? [fmtDate(r.tanggalProsesSelesai), esc(r.noInvoice), fmtDate(r.tanggalInvoice)] : [fmtDate(r.expiredDokumen)])];
    return `<tr>${cells.map((c) => `<td ${td}>${c}</td>`).join('')}</tr>`;
  });
  return `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px"><tr>${head.map((h) => `<th ${th}>${esc(h)}</th>`).join('')}</tr>${rows.join('')}</table>`;
}

/** Isi email dari template: @@ClientData@@ → tabel, @@Keperluan@@ → nama Keperluan. Tanpa @@ClientData@@ tabel ditambahkan di akhir. */
export function buildBody(content: string, keperluan: string, table: string): string {
  const withTable = content.includes('@@ClientData@@') ? content : `${content}<br/><br/>@@ClientData@@`;
  return withTable.replaceAll('@@Keperluan@@', esc(keperluan)).replaceAll('@@ClientData@@', table);
}

/** Subject: subject template + Keperluan + jumlah client. */
export const buildSubject = (base: string, keperluan: string, count: number) => `${base} - ${keperluan} (${count} client)`;

