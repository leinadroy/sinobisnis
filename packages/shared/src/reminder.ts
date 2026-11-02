// Tipe & definisi modul Email Reminder dan Developer Menu (dipakai web dan api).

import type { Paginated } from './types.js';

/** Kategori reminder; kode = Email Template `code` yang dipakai untuk subject & isi email. */
export const REMINDER_TYPES = ['EXPIRED_2', 'EXPIRED_1', 'INVOICE_CREATE', 'INVOICE_PAY', 'EPO'] as const;
export type ReminderType = (typeof REMINDER_TYPES)[number];

export const REMINDER_LABELS: Record<ReminderType, string> = {
  EXPIRED_2: 'Reminder ke-2 expired',
  EXPIRED_1: 'Dokumen akan expired',
  INVOICE_CREATE: 'Belum dibuat invoice',
  INVOICE_PAY: 'Invoice belum dibayar',
  EPO: 'Perlu EPO',
};

/** Reminder invoice dikirim ke penerima Accounting; lainnya ke penerima umum. */
export const ACCOUNTING_REMINDERS: ReminderType[] = ['INVOICE_CREATE', 'INVOICE_PAY'];

/** Arti kolom "Hari" per kategori. */
export const REMINDER_DAY_LABELS: Record<ReminderType, string | null> = {
  EXPIRED_2: 'Sisa Hari',
  EXPIRED_1: 'Sisa Hari',
  INVOICE_CREATE: 'Hari Sejak Selesai',
  INVOICE_PAY: 'Hari Sejak Invoice',
  EPO: null,
};

export interface ReminderItem {
  id: number;
  name: string;
  noPaspor: string | null;
  sponsorName: string | null;
  projectName: string | null;
  keperluanName: string | null;
  tanggalProsesSelesai: string | null;
  expiredDokumen: string | null;
  noInvoice: string | null;
  tanggalInvoice: string | null;
  /** Sisa hari (expired) atau hari sejak selesai/invoice; null untuk EPO. */
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
  /** Jumlah penerima aktif TO (umum / accounting). */
  recipients: { general: number; accounting: number };
}

export interface ReminderLogRow {
  id: number;
  createdAt: string;
  type: string;
  subject: string | null;
  recipients: string | null;
  itemCount: number | null;
  status: string | null;
  error: string | null;
}

export type ReminderLogList = Paginated<ReminderLogRow>;

export type ReminderRunStatus = 'SENT' | 'SKIPPED' | 'NOT SENT' | 'FAILED';

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

/** Key yang dipakai aplikasi (key lain tetap boleh ditambahkan). */
export const SYSTEM_CONFIG_KEYS: SystemConfigKeyInfo[] = [
  { key: 'SITE_URL', label: 'Alamat web', help: 'Dipakai untuk link client di email reminder, mis. https://sinobisnis.example.com' },
  { key: 'SMTP_HOST', label: 'SMTP host', help: 'Kosong = email tidak dikirim (tercatat NOT SENT).' },
  { key: 'SMTP_PORT', label: 'SMTP port', help: '587 (STARTTLS) atau 465 (SSL).' },
  { key: 'SMTP_SECURE', label: 'SMTP SSL', help: '1 untuk port 465, 0 untuk lainnya.' },
  { key: 'SMTP_USERNAME', label: 'SMTP username' },
  { key: 'SMTP_PASSWORD', label: 'SMTP password', secret: true },
  { key: 'SMTP_FROM', label: 'Pengirim', help: 'mis. "Sinobisnis <noreply@domain.com>"; kosong = SMTP username.' },
  { key: 'REMINDER_ENABLED', label: 'Reminder otomatis', help: '1 = aktif, 0 = nonaktif.', schedule: true },
  { key: 'REMINDER_CRON', label: 'Jadwal reminder (cron)', help: 'menit jam tgl bulan hari. Default 0 8 * * 1-5 = Senin–Jumat 08:00.', schedule: true },
  { key: 'REMINDER_TIMEZONE', label: 'Zona waktu jadwal', help: 'Default Asia/Jakarta.', schedule: true },
  { key: 'EXPIRED_SECOND_REMINDER_DAYS', label: 'Reminder expired ke-2 (hari)', help: 'Dipakai bila Keperluan tidak mengisi Reminder Expired ke-2.' },
  { key: 'DEFAULT_ADDITIONAL_INFORMATION', label: 'Important Information default', help: 'Untuk invoice baru bila Company belum mengisi Invoice Information.' },
  { key: 'DISETUJUI_OLEH', label: 'Penanda tangan default', help: 'Di cetakan invoice bila Company tidak punya Signed By.' },
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
