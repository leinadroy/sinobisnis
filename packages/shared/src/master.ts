// Definisi master data: dipakai web (form & kolom generik) dan api (key menu, slug endpoint).
// Slug = key menu = segmen URL (/master/<slug>, API /api/master/<slug>).

export type FieldType = 'text' | 'textarea' | 'number' | 'checkbox' | 'select' | 'ref';
export type RefSource = 'sponsors' | 'billTos' | 'bankAccounts';

export interface MasterField {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** Untuk type 'select'. */
  options?: string[];
  /** Untuk type 'ref': sumber pilihan dari /api/master/options. */
  ref?: RefSource;
  /** Kolom yang ditampilkan di list (default true kecuali textarea). */
  list?: boolean;
  /** Field relasi yang ditampilkan di list (mis. sponsorName untuk sponsorId). */
  listField?: string;
  /** Bisa di-sort di list. */
  sortable?: boolean;
  help?: string;
}

export interface MasterEntity {
  slug: string;
  title: string;
  help?: string;
  /** Field untuk judul baris / konfirmasi hapus. */
  titleField: string;
  fields: MasterField[];
}

export const SUMBER_DATA = [
  'TANGGAL TERBIT DOKUMEN',
  'TANGGAL MASUK INDO / EXP. DOKUMEN SEBELUMNYA',
  'TANGGAL PROSES SELESAI',
] as const;
export const PERIODE_UNITS = ['MONTHS', 'DAYS'] as const;
export const TAX_TYPES = ['ADDITION', 'REDUCTION'] as const;

export const MASTER_ENTITIES: MasterEntity[] = [
  {
    slug: 'sponsors', title: 'Sponsor', titleField: 'name',
    fields: [{ name: 'name', label: 'Name', type: 'text', required: true, sortable: true }],
  },
  {
    slug: 'sponsor-projects', title: 'Sponsor Project', titleField: 'name',
    fields: [
      { name: 'sponsorId', label: 'Sponsor', type: 'ref', ref: 'sponsors', required: true, listField: 'sponsorName', sortable: true },
      { name: 'name', label: 'Project Name', type: 'text', required: true, sortable: true },
      { name: 'billToId', label: 'Bill To', type: 'ref', ref: 'billTos', listField: 'billToName', sortable: true },
    ],
  },
  {
    slug: 'bill-to', title: 'Bill To', titleField: 'companyName',
    fields: [
      { name: 'kodePerusahaan', label: 'Kode Perusahaan', type: 'text', sortable: true },
      { name: 'companyName', label: 'Company Name', type: 'text', required: true, sortable: true },
      { name: 'npwp', label: 'NPWP', type: 'text' },
      { name: 'alamat1', label: 'Alamat Baris 1', type: 'text' },
      { name: 'alamat2', label: 'Alamat Baris 2', type: 'text' },
      { name: 'alamat3', label: 'Alamat Baris 3', type: 'text', list: false },
      { name: 'alamat4', label: 'Alamat Baris 4', type: 'text', list: false },
    ],
  },
  {
    slug: 'keperluan', title: 'Keperluan', titleField: 'name',
    help: 'Periode + Sumber Data menghitung Expired Dokumen otomatis. Kolom Reminder (hari sebelum/sesudah) menentukan kapan email reminder dikirim.',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, sortable: true },
      { name: 'periode', label: 'Periode', type: 'number', sortable: true },
      { name: 'periodeIn', label: 'Periode In', type: 'select', options: [...PERIODE_UNITS] },
      { name: 'sumberData', label: 'Sumber Data', type: 'select', options: [...SUMBER_DATA] },
      { name: 'isActive', label: 'Is Active', type: 'checkbox', sortable: true },
      { name: 'harga', label: 'Harga Default (Rp)', type: 'number', sortable: true },
      { name: 'reminderExpiredDokumen', label: 'Reminder Expired (hari)', type: 'number' },
      { name: 'reminderExpired2nd', label: 'Reminder Expired ke-2 (hari)', type: 'number' },
      { name: 'reminderPembuatanInvoice', label: 'Reminder Pembuatan Invoice (hari)', type: 'number' },
      { name: 'reminderPembayaranInvoice', label: 'Reminder Pembayaran Invoice (hari)', type: 'number' },
    ],
  },
  {
    slug: 'companies', title: 'Company', titleField: 'name',
    help: 'No Format: {NO} nomor urut, {ROMAWI} bulan romawi, {MM} bulan, {YYYY}/{YY} tahun. Contoh: {NO}/SML/{ROMAWI}/{YYYY}.',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, sortable: true },
      { name: 'address', label: 'Address', type: 'textarea' },
      { name: 'lastNo', label: 'Last No', type: 'number', sortable: true },
      { name: 'noFormat', label: 'No Format', type: 'text' },
      { name: 'bankAccountId', label: 'Default Bank Account', type: 'ref', ref: 'bankAccounts', listField: 'bankAccountLabel' },
      { name: 'invoiceInformation', label: 'Invoice Information', type: 'textarea', help: 'Tampil sebagai "Important Information" di cetakan invoice.' },
      { name: 'signedBy', label: 'Signed By', type: 'text' },
      { name: 'signedTitle', label: 'Signed Title', type: 'text', list: false },
    ],
  },
  {
    slug: 'bank-accounts', title: 'Bank Account', titleField: 'bankName',
    fields: [
      { name: 'bankName', label: 'Bank Name', type: 'text', required: true, sortable: true },
      { name: 'branch', label: 'Branch', type: 'text' },
      { name: 'address', label: 'Bank Address', type: 'textarea' },
      { name: 'swiftcode', label: 'Swiftcode', type: 'text' },
      { name: 'accountFor', label: 'Account For', type: 'text', sortable: true },
      { name: 'accountNo', label: 'Account No', type: 'text', sortable: true },
    ],
  },
  {
    slug: 'taxes', title: 'Tax', titleField: 'name',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, sortable: true },
      { name: 'percentage', label: 'Percentage', type: 'number', required: true, sortable: true },
      { name: 'type', label: 'Addition / Reduction', type: 'select', options: [...TAX_TYPES], sortable: true },
    ],
  },
];

export const masterEntity = (slug: string) => MASTER_ENTITIES.find((e) => e.slug === slug);

export interface MasterOptions {
  sponsors: { id: number; name: string }[];
  billTos: { id: number; label: string; npwp: string | null }[];
  bankAccounts: { id: number; label: string }[];
  projects: { id: number; name: string; sponsorId: number; billToId: number | null }[];
  keperluan: { id: number; name: string; periode: number; periodeIn: string; sumberData: string; harga: number; isActive: boolean }[];
  taxes: { id: number; name: string; percentage: number; type: string }[];
}
