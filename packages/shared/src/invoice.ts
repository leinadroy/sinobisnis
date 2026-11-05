// Tipe & aturan bisnis modul Invoice, Update Request, dan Kontrak (dipakai web dan api).

import type { Paginated } from './types.js';

export const INVOICE_STATUSES = ['DRAFT', 'FINAL', 'PAID'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'DONE'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

// ───────────────────────── Invoice ─────────────────────────

export interface InvoiceRow {
  id: number;
  no: string | null;
  date: string | null;
  paidDate: string | null;
  status: InvoiceStatus;
  companyId: number | null;
  companyName: string | null;
  sponsorId: number | null;
  sponsorName: string | null;
  billToId: number | null;
  billToName: string | null;
  npwp: string | null;
  subTotal: number;
  total: number;
  information: string | null;
  bankAccountLabel: string | null;
  /** Status Update Request terakhir (null bila belum pernah). */
  requestStatus: RequestStatus | null;
  clientCount: number;
  createdBy: string | null;
}

/** List invoice + jumlah nominal semua invoice yang lolos filter. */
export interface InvoiceList extends Paginated<InvoiceRow> {
  amount: number;
}

export interface InvoiceItemRow {
  id?: number;
  description: string;
  keperluanId: number | null;
  qty: number;
  unitPrice: number;
  subTotal: number;
}

/** Baris nama TKA di grup: `id` = id client bila terhubung (null = nama saja, umumnya dari invoice sistem lama). */
export interface InvoiceGroupClientRow {
  id: number | null;
  name: string;
  noPaspor: string | null;
}

export interface InvoiceGroupRow {
  id?: number;
  clients: InvoiceGroupClientRow[];
  items: InvoiceItemRow[];
}

export interface InvoiceTaxRow {
  id?: number;
  taxId: number | null;
  description: string;
  value: number;
}

export interface InvoiceAttachmentRow {
  id: number;
  originalName: string;
  mime: string | null;
  size: number | null;
  /** Tabel invoiceattachment lama tidak menyimpan waktu unggah. */
  uploadedAt: string | null;
  /** Client pemilik lampiran (lampiran rujukan dari data client); null = diunggah langsung ke invoice. */
  clientName: string | null;
}

/** Model cetakan invoice menurut awalan nomor (…/SML/…, …/RTS/…, …/JCSS/…); lainnya SML. */
export type InvoicePrintModel = 'SML' | 'RTS' | 'JCSS';
export function invoicePrintModel(no: string | null | undefined): InvoicePrintModel {
  const parts = (no ?? '').toUpperCase().split('/').map((p) => p.trim());
  if (parts.includes('RTS')) return 'RTS';
  if (parts.includes('JCSS')) return 'JCSS';
  return 'SML';
}

export interface UpdateRequestRow {
  id: number;
  invoiceId: number;
  invoiceNo: string | null;
  status: RequestStatus;
  reason: string | null;
  requestedBy: string | null;
  decidedBy: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface InvoiceDetail extends InvoiceRow {
  bankAccountId: number | null;
  totalTerbilang: string | null;
  createdAt: string;
  groups: InvoiceGroupRow[];
  taxes: InvoiceTaxRow[];
  attachments: InvoiceAttachmentRow[];
  requests: UpdateRequestRow[];
  /** DRAFT, atau FINAL/PAID dengan Update Request yang sudah disetujui. */
  editable: boolean;
}

/** Body simpan invoice (PUT /invoices/:id). Sub total, pajak persentase, total & terbilang dihitung API. */
export interface InvoiceInput {
  no: string | null;
  companyId: number | null;
  sponsorId: number | null;
  billToId: number | null;
  npwp: string | null;
  date: string | null;
  paidDate: string | null;
  status: InvoiceStatus;
  information: string | null;
  bankAccountId: number | null;
  groups: {
    /** Urutan = urutan cetak. clientId null = nama tanpa data client (name wajib). */
    clients: { clientId: number | null; name: string }[];
    items: { description: string; keperluanId: number | null; qty: number; unitPrice: number }[];
  }[];
  taxes: { taxId: number | null; description: string; value: number }[];
}

export interface CreateInvoiceInput {
  clientIds: number[];
  companyId: number;
  billToId?: number | null;
}

export interface CreateInvoiceResult {
  id: number;
  no: string | null;
  /** Jumlah grup yang belum punya harga (tidak ada di Kontrak maupun harga default Keperluan). */
  missingPrice: number;
}

/** Client yang bisa dimasukkan ke invoice (belum punya invoice). */
export interface InvoiceableClientRow {
  id: number;
  name: string;
  noPaspor: string | null;
  sponsorId: number | null;
  sponsorName: string | null;
  projectName: string | null;
  keperluanName: string | null;
  billToId: number | null;
  tanggalPermohonan: string | null;
  tanggalProsesSelesai: string | null;
}

/** Item harga yang berlaku untuk satu Bill To (kontrak terbaru per layanan). */
export interface PriceListItem {
  description: string;
  keperluanId: number | null;
  duration: string | null;
  price: number;
  kontrakDate: string | null;
}

/** Data cetak invoice: detail + Company, Bill To, rekening, dan penanda tangan. */
export interface InvoicePrintData {
  invoice: InvoiceDetail;
  company: { name: string; address: string | null; signedBy: string | null; signedTitle: string | null } | null;
  billTo: { companyName: string; npwp: string | null; address: string[] } | null;
  bank: { bankName: string; branch: string | null; address: string | null; swiftcode: string | null; accountFor: string | null; accountNo: string | null } | null;
}

// ───────────────────────── Kontrak ─────────────────────────

export interface KontrakRow {
  id: number;
  date: string | null;
  billToId: number;
  billToName: string;
  nomor: string | null;
  itemCount: number;
}

/** Satu harga per Keperluan (tabel kontrakdetail); nama layanan = nama Keperluan. */
export interface KontrakItemRow {
  id?: number;
  keperluanId: number;
  description: string;
  duration: string | null;
  price: number;
}

export interface KontrakDetail extends KontrakRow {
  items: KontrakItemRow[];
}

export interface KontrakInput {
  date: string | null;
  billToId: number;
  nomor: string | null;
  items: { keperluanId: number; duration: string | null; price: number }[];
}

// ───────────────────────── Perhitungan ─────────────────────────

const ROMAWI = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/**
 * Nomor invoice dari CompanyInvoiceNoFormat (format GeneXus): @autonumber@ = penghitung company (CompanyInvoiceLastNo + 1),
 * minimal 3 digit; @ROM@ bulan romawi,
 * @MM@ bulan, @YYYY@ / @YY@ tahun. `date` = 'YYYY-MM-DD'. Contoh: @YY@@autonumber@/SML/@ROM@/@YYYY@ → 26373/SML/XI/2026.
 */
export function formatInvoiceNo(format: string | null | undefined, seq: number, date: string): string {
  const [y, m] = date.slice(0, 10).split('-');
  return (format?.trim() || '@autonumber@')
    .replaceAll('@autonumber@', String(seq).padStart(3, '0'))
    .replaceAll('@ROM@', ROMAWI[Number(m) - 1] ?? '')
    .replaceAll('@MM@', m)
    .replaceAll('@YYYY@', y)
    .replaceAll('@YY@', y.slice(2));
}


/** Pembulatan nominal ke 2 desimal (hindari 0.1 + 0.2 = 0.30000000000000004). */
export const roundMoney = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Nilai pajak dari master Tax: persentase × sub total, dibulatkan ke rupiah; REDUCTION bernilai negatif. */
export function taxValue(subTotal: number, tax: { percentage: number; type: string }): number {
  const v = Math.round((subTotal * tax.percentage) / 100);
  return tax.type === 'REDUCTION' ? -v : v;
}

/**
 * Hitung sub total, nilai tiap pajak, dan total. Baris pajak dengan taxId memakai persentase master Tax
 * (nilai yang dikirim diabaikan); baris "Other" (taxId null) memakai nilai yang diisi.
 */
export function computeInvoiceTotals(
  groups: { items: { qty: number; unitPrice: number }[] }[],
  taxes: { taxId: number | null; value: number }[],
  master: { id: number; percentage: number; type: string }[],
) {
  const subTotal = roundMoney(groups.reduce((s, g) => s + g.items.reduce((t, it) => t + roundMoney(it.qty * it.unitPrice), 0), 0));
  const taxValues = taxes.map((t) => {
    const m = t.taxId ? master.find((x) => x.id === t.taxId) : undefined;
    return m ? taxValue(subTotal, m) : roundMoney(t.value);
  });
  const total = roundMoney(subTotal + taxValues.reduce((s, v) => s + v, 0));
  return { subTotal, taxValues, total };
}

const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
function terbilangInt(n: number): string {
  n = Math.floor(n);
  if (n < 12) return SATUAN[n];
  if (n < 20) return terbilangInt(n - 10) + ' belas';
  if (n < 100) return terbilangInt(n / 10) + ' puluh ' + terbilangInt(n % 10);
  if (n < 200) return 'seratus ' + terbilangInt(n - 100);
  if (n < 1000) return terbilangInt(n / 100) + ' ratus ' + terbilangInt(n % 100);
  if (n < 2000) return 'seribu ' + terbilangInt(n - 1000);
  if (n < 1e6) return terbilangInt(n / 1000) + ' ribu ' + terbilangInt(n % 1000);
  if (n < 1e9) return terbilangInt(n / 1e6) + ' juta ' + terbilangInt(n % 1e6);
  if (n < 1e12) return terbilangInt(n / 1e9) + ' miliar ' + terbilangInt(n % 1e9);
  return terbilangInt(n / 1e12) + ' triliun ' + terbilangInt(n % 1e12);
}

/** Terbilang rupiah bahasa Indonesia: 1500000 → "Satu Juta Lima Ratus Ribu Rupiah" (dibulatkan ke rupiah). */
export function terbilang(n: number): string {
  const v = Math.round(Number(n) || 0);
  if (v === 0) return 'Nol Rupiah';
  const s = (v < 0 ? 'minus ' : '') + terbilangInt(Math.abs(v)) + ' rupiah';
  return s.replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

const EN_ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const EN_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function enBelowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(EN_ONES[h] + ' Hundred');
  if (r) parts.push(r < 20 ? EN_ONES[r] : EN_TENS[Math.floor(r / 10)] + (r % 10 ? ' ' + EN_ONES[r % 10] : ''));
  return parts.join(' ');
}

/** Terbilang bahasa Inggris untuk cetakan invoice (nilai absolut, dibulatkan): 1250 → "One Thousand Two Hundred Fifty". */
export function terbilangEn(n: number): string {
  let v = Math.round(Math.abs(Number(n) || 0));
  if (v === 0) return 'Zero';
  const scales = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];
  const parts: string[] = [];
  for (let i = 0; v > 0; i++, v = Math.floor(v / 1000)) {
    const chunk = v % 1000;
    if (chunk) parts.unshift(enBelowThousand(chunk) + (scales[i] ? ' ' + scales[i] : ''));
  }
  return parts.join(' ');
}

/** Tanggal hari ini 'YYYY-MM-DD' menurut jam lokal mesin. */
export function todayStr(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
