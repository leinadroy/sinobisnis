// Tipe & definisi modul Email Reminder dan System Configurator (dipakai web dan api).
// Aturan mengikuti aplikasi lama (diverifikasi terhadap log reminder di tabel datalog): satu email per kategori per
// Keperluan, hanya client yang TEPAT jatuh pada hari ke-N (N dari kolom Reminder di Keperluan; 0 = nonaktif).

import type { Paginated } from './types.js';

export const REMINDER_TYPES = ['EXPIRED_2', 'EXPIRED_1', 'INVOICE_CREATE', 'INVOICE_PAY', 'EPO'] as const;
export type ReminderType = (typeof REMINDER_TYPES)[number];

export const REMINDER_LABELS: Record<ReminderType, string> = {
  EXPIRED_2: 'Reminder ke-2 expired',
  EXPIRED_1: 'Dokumen akan expired',
  INVOICE_CREATE: 'Belum dibuat invoice',
  INVOICE_PAY: 'Invoice belum dibayar',
  EPO: 'Perlu EPO',
};

/** Id baris emailtemplate per kategori (tabel lama tidak punya kolom kode). */
export const REMINDER_TEMPLATE_ID: Record<ReminderType, number> = {
  EXPIRED_1: 1, INVOICE_CREATE: 2, INVOICE_PAY: 3, EXPIRED_2: 4, EPO: 5,
};

/** Awalan teks log di datalog (TableName 'Reminder'), sama dengan aplikasi lama: "Success Run <awalan> <Keperluan>(N items)". */
export const REMINDER_LOG_PREFIX: Record<ReminderType, string> = {
  EXPIRED_1: 'Schedule Expired', EXPIRED_2: 'Schedule 2nd', INVOICE_CREATE: 'Reminder Pembuatan Invoice',
  INVOICE_PAY: 'Reminder Pembayaran Invoice', EPO: 'Schedule EPO',
};

/** Reminder invoice dikirim ke penerima Accounting; lainnya ke penerima umum. */
export const ACCOUNTING_REMINDERS: ReminderType[] = ['INVOICE_CREATE', 'INVOICE_PAY'];

/** Arti kolom "Hari" per kategori. */
export const REMINDER_DAY_LABELS: Record<ReminderType, string | null> = {
  EXPIRED_2: 'Sisa Hari',
  EXPIRED_1: 'Sisa Hari',
  INVOICE_CREATE: 'Hari Sejak Selesai',
  INVOICE_PAY: 'Hari Sejak Invoice',
  EPO: 'Sisa Hari',
};

export interface ReminderItem {
  id: number;
  name: string;
  noPaspor: string | null;
  sponsorName: string | null;
  projectName: string | null;
  keperluanId: number;
  keperluanName: string | null;
  tanggalProsesSelesai: string | null;
  expiredDokumen: string | null;
  noInvoice: string | null;
  tanggalInvoice: string | null;
  /** Sisa hari (expired) atau hari sejak selesai/invoice = nilai Reminder Keperluan. */
  days: number | null;
}

export interface ReminderSchedule {
  enabled: boolean;
  cron: string;
  timezone: string;
  /** null bila nonaktif atau cron tidak valid. */
  nextRun: string | null;
  error: string | null;
}

export interface ReminderOverview {
  counts: Record<ReminderType, number>;
  schedule: ReminderSchedule;
  smtpConfigured: boolean;
  /** Jumlah penerima aktif (umum / accounting). */
  recipients: { general: number; accounting: number };
}

export interface ReminderLogRow {
  id: number;
  createdAt: string;
  /** Kategori (kosong bila teks log tidak dikenali). */
  type: ReminderType | '';
  keperluan: string | null;
  /** Teks log lengkap (format aplikasi lama). */
  text: string;
  itemCount: number | null;
  status: 'SENT' | 'FAILED' | 'NOT SENT' | null;
  runBy: string | null;
  error: string | null;
}

export type ReminderLogList = Paginated<ReminderLogRow>;

export type ReminderRunStatus = 'SENT' | 'SKIPPED' | 'NOT SENT' | 'FAILED';

/** Hasil kirim per kategori (gabungan semua Keperluan). */
export interface ReminderRunResult {
  type: ReminderType;
  status: ReminderRunStatus;
  count: number;
  note: string | null;
}

// ───────────────────────── System Configurator ─────────────────────────

export interface SystemConfigKeyInfo {
  key: string;
  label: string;
  help?: string;
  /** Nilai tidak pernah dikirim balik ke browser. */
  secret?: boolean;
  /** Mengubahnya memuat ulang jadwal reminder. */
  schedule?: boolean;
}

/** Key yang dipakai aplikasi (nama key tabel systemconfigurator lama; key lain tetap boleh ditambahkan). */
export const SYSTEM_CONFIG_KEYS: SystemConfigKeyInfo[] = [
  { key: 'Site URL', label: 'Alamat web', help: 'Dipakai untuk link client di email reminder, mis. https://smlgroupid.com' },
  { key: 'SMTP Host', label: 'SMTP host', help: 'Kosong = email tidak dikirim (tercatat NOT SENT).' },
  { key: 'SMTP Port Numeric', label: 'SMTP port', help: '587 (STARTTLS) atau 465 (SSL).' },
  { key: 'SMTP Authentication Numeric', label: 'SMTP pakai login', help: '1 = kirim username & password, 0 = tanpa login.' },
  { key: 'SMTP Username', label: 'SMTP username' },
  { key: 'SMTP Password', label: 'SMTP password', secret: true },
  { key: 'SMTP From', label: 'Pengirim', help: 'mis. "Sinobisnis <admin@smlgroupid.com>"; kosong = SMTP username.' },
  { key: 'Reminder Enabled', label: 'Reminder otomatis', help: '1 = aktif, 0 = nonaktif.', schedule: true },
  { key: 'Reminder Cron', label: 'Jadwal reminder (cron)', help: 'menit jam tgl bulan hari. Default 0 7 * * * = setiap hari 07:00 (aplikasi lama berjalan 00:00 UTC = 07:00 WIB).', schedule: true },
  { key: 'Reminder Timezone', label: 'Zona waktu jadwal', help: 'Default Asia/Jakarta.', schedule: true },
  { key: 'Default Additional Information', label: 'Important Information default', help: 'Untuk invoice baru bila Company belum mengisi Invoice Information.' },
  { key: 'SML Disetujui Oleh', label: 'Teks persetujuan SML' },
  { key: 'System Salt', label: 'System salt (aplikasi lama)', secret: true },
];

export const systemConfigInfo = (key: string) => SYSTEM_CONFIG_KEYS.find((k) => k.key === key);

export interface SystemConfigRow {
  key: string;
  /** null untuk key secret (lihat hasValue). */
  value: string | null;
  hasValue: boolean;
  secret: boolean;
  label: string | null;
  help: string | null;
}
