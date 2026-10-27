// Tipe & aturan bisnis modul Client (dipakai web dan api).

/** Field tanggal client; dikirim/diterima sebagai 'YYYY-MM-DD' (atau null). */
export const CLIENT_DATE_FIELDS = [
  'tanggalPermohonan', 'tanggalLahir', 'pembayaranPnbp', 'tanggalProsesSelesai', 'tanggalTerbitDokumen',
  'tanggalMasukLastExp', 'expiredDokumen', 'tanggalInvoice', 'tanggalPembayaranInvoice',
] as const;

export const CLIENT_TEXT_FIELDS = [
  'name', 'noPaspor', 'noRptka', 'permohonanHariKe3', 'epo', 'noInvoice', 'prosesPerpanjangan',
  'sktt', 'stm', 'status', 'keteranganTka', 'archivedReason',
] as const;

export type ClientDateField = (typeof CLIENT_DATE_FIELDS)[number];
export type ClientTextField = (typeof CLIENT_TEXT_FIELDS)[number];

export type ClientInput = { [K in ClientDateField]?: string | null } & { [K in ClientTextField]?: string | null } & {
  sponsorId?: number | null;
  projectId?: number | null;
  keperluanId?: number | null;
  isArchived?: boolean;
};

export interface ClientRow {
  id: number;
  sponsorId: number | null;
  sponsorName: string | null;
  projectId: number | null;
  projectName: string | null;
  keperluanId: number | null;
  keperluanName: string | null;
  name: string;
  noPaspor: string | null;
  tanggalPermohonan: string | null;
  permohonanHariKe3: string | null;
  tanggalLahir: string | null;
  noRptka: string | null;
  tanggalProsesSelesai: string | null;
  expiredDokumen: string | null;
  epo: string | null;
  noInvoice: string | null;
  tanggalInvoice: string | null;
  tanggalPembayaranInvoice: string | null;
  keteranganTka: string | null;
  tanggalTerbitDokumen: string | null;
  tanggalMasukLastExp: string | null;
  prosesPerpanjangan: string | null;
  status: string | null;
  sktt: string | null;
  stm: string | null;
  isArchived: boolean;
  archivedReason: string | null;
  invoiceId: number | null;
  attachmentCount: number;
}

export interface ClientAttachmentRow {
  id: number;
  originalName: string;
  mime: string | null;
  size: number | null;
  uploadedAt: string;
}

export interface ConversationRow {
  id: number;
  userName: string | null;
  message: string;
  createdAt: string;
}

export interface ClientLogRow {
  id: number;
  historyDate: string;
  userName: string | null;
  clientId: number | null;
  action: string;
  snapshot: Partial<ClientRow> | null;
}

export interface ClientDetail extends ClientRow {
  pembayaranPnbp: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: ClientAttachmentRow[];
  conversations: ConversationRow[];
  history: { id: number; historyDate: string; userName: string | null; action: string }[];
}

export interface PersonRow {
  name: string;
  noPaspor: string | null;
  tanggalLahir: string | null;
  jumlah: number;
  lastId: number;
}

/** Filter list client (query string). */
export interface ClientFilter {
  sponsorId?: number;
  keperluanId?: number;
  from?: string;
  to?: string;
  /** Expired dalam N hari ke depan (termasuk yang sudah lewat). */
  expiring?: number;
  uninvoiced?: boolean;
  unpaid?: boolean;
}

/** Tambah periode (bulan/hari) ke tanggal 'YYYY-MM-DD' (UTC, tanpa pergeseran zona waktu). */
export function addPeriod(date: string | null | undefined, n: number, unit: string): string | null {
  if (!date || !n) return null;
  const d = new Date(date.slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return null;
  if (unit === 'DAYS') d.setUTCDate(d.getUTCDate() + n);
  else d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** Tanggal sumber untuk menghitung Expired Dokumen sesuai pengaturan Keperluan. */
export function expiredSource(c: Partial<Record<ClientDateField, string | null>>, sumberData: string): string | null | undefined {
  if (sumberData === 'TANGGAL PROSES SELESAI') return c.tanggalProsesSelesai;
  if (sumberData.startsWith('TANGGAL MASUK INDO')) return c.tanggalMasukLastExp;
  return c.tanggalTerbitDokumen;
}

/** Expired Dokumen otomatis = tanggal sumber + periode keperluan; null bila tidak bisa dihitung. */
export function computeExpired(
  c: Partial<Record<ClientDateField, string | null>>,
  k: { periode: number; periodeIn: string; sumberData: string } | null | undefined,
): string | null {
  if (!k || !k.periode) return null;
  return addPeriod(expiredSource(c, k.sumberData), k.periode, k.periodeIn);
}

/** Selisih hari dari hari ini ke tanggal 'YYYY-MM-DD' (negatif = sudah lewat). */
export function daysUntil(date: string | null | undefined, today = new Date()): number | null {
  if (!date) return null;
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const d = Date.parse(date.slice(0, 10) + 'T00:00:00Z');
  return Number.isNaN(d) ? null : Math.round((d - t) / 86_400_000);
}
