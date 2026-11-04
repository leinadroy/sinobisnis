// Definisi master data: dipakai web (form & kolom generik) dan api (key menu, slug endpoint).
// Slug = key menu = segmen URL (/master/<slug>, API /api/master/<slug>).
// Nama field = nama field model Prisma (struktur tabel production, lihat apps/api/prisma/schema.prisma).

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
  /** Checkbox: tidak tercentang saat Insert (default tercentang). */
  defaultOff?: boolean;
  /** Hanya ditampilkan (mis. Id), tidak ada di form dan tidak dikirim saat simpan. */
  readOnly?: boolean;
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
export const PRINT_FORMATS = ['ProcPrintInvoiceSML', 'ProcPrintInvoiceRTS', 'ProcPrintInvoiceJCSS'] as const;

export const MASTER_ENTITIES: MasterEntity[] = [
  {
    slug: 'sponsors', title: 'Sponsor', titleField: 'name',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, sortable: true },
      { name: 'isActive', label: 'Is Active', type: 'checkbox', sortable: true },
    ],
  },
  {
    slug: 'sponsor-projects', title: 'Sponsor Project', titleField: 'name',
    help: 'Data perusahaan penagihan project ini; dipakai mencari Bill To saat Create Invoice (cocok nama / NPWP / kode).',
    fields: [
      { name: 'sponsorId', label: 'Sponsor', type: 'ref', ref: 'sponsors', required: true, listField: 'sponsorName', sortable: true },
      { name: 'name', label: 'Project Name', type: 'text', required: true, sortable: true },
      { name: 'kodePerusahaan', label: 'Kode Perusahaan', type: 'text', sortable: true },
      { name: 'companyName', label: 'Company Name', type: 'text', sortable: true },
      { name: 'npwp', label: 'NPWP', type: 'text', list: false },
      { name: 'alamat1', label: 'Alamat Baris 1', type: 'text', list: false },
      { name: 'alamat2', label: 'Alamat Baris 2', type: 'text', list: false },
      { name: 'alamat3', label: 'Alamat Baris 3', type: 'text', list: false },
      { name: 'alamat4', label: 'Alamat Baris 4', type: 'text', list: false },
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
    help: 'Periode + Sumber Data menghitung Expired Dokumen otomatis. Kolom Reminder (hari) menentukan kapan email reminder dikirim; 0 = default.',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, sortable: true },
      { name: 'periode', label: 'Periode', type: 'number', sortable: true },
      { name: 'periodeIn', label: 'Periode In', type: 'select', options: [...PERIODE_UNITS] },
      { name: 'sumberData', label: 'Sumber Data', type: 'select', options: [...SUMBER_DATA] },
      { name: 'isActive', label: 'Is Active', type: 'checkbox', sortable: true },
      { name: 'reminderExpiredDokumen', label: 'Reminder Expired (hari)', type: 'number' },
      { name: 'reminderExpired2nd', label: 'Reminder Expired ke-2 (hari)', type: 'number' },
      { name: 'reminderPembuatanInvoice', label: 'Reminder Pembuatan Invoice (hari)', type: 'number' },
      { name: 'reminderPembayaranInvoice', label: 'Reminder Pembayaran Invoice (hari)', type: 'number' },
      { name: 'reminderEpo', label: 'Reminder EPO (hari)', type: 'number', list: false },
    ],
  },
  {
    slug: 'companies', title: 'Company', titleField: 'name',
    help: 'Invoice No Format: @YY@ tahun 2 digit, @YYYY@ tahun, @ROM@ bulan romawi, @MM@ bulan, @autonumber@ = Invoice Last No + 1 (minimal 3 digit). Contoh: @YY@@autonumber@/SML/@ROM@/@YYYY@ dengan Last No 1406 → 261407/SML/XI/2026. Nomor bisa diubah di form invoice.',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, sortable: true },
      { name: 'address', label: 'Address', type: 'textarea' },
      { name: 'invoiceNoFormat', label: 'Invoice No Format', type: 'text', required: true },
      { name: 'printFormat', label: 'Print Format', type: 'select', options: [...PRINT_FORMATS], list: false },
      { name: 'invoiceLastNo', label: 'Invoice Last No', type: 'number', sortable: true, help: 'Penghitung @autonumber@; naik 1 setiap Create Invoice.' },
      { name: 'bankAccountId', label: 'Default Bank Account', type: 'ref', ref: 'bankAccounts', listField: 'bankAccountLabel' },
      { name: 'invoiceInformation', label: 'Invoice Information', type: 'textarea', help: 'Tampil sebagai "Important Information" di cetakan invoice.' },
      { name: 'invoiceSignedBy', label: 'Signed By', type: 'text' },
    ],
  },
  {
    slug: 'bank-accounts', title: 'Bank Account', titleField: 'bankName',
    fields: [
      { name: 'bankName', label: 'Bank Name', type: 'text', required: true, sortable: true },
      { name: 'branch', label: 'Branch', type: 'text' },
      { name: 'address1', label: 'Bank Address 1', type: 'text', list: false },
      { name: 'address2', label: 'Bank Address 2', type: 'text', list: false },
      { name: 'address3', label: 'Bank Address 3', type: 'text', list: false },
      { name: 'address4', label: 'Bank Address 4', type: 'text', list: false },
      { name: 'swiftcode', label: 'Swiftcode', type: 'text' },
      { name: 'accountFor', label: 'Account For', type: 'text', required: true, sortable: true },
      { name: 'accountNo', label: 'Account No', type: 'text', required: true, sortable: true },
    ],
  },
  {
    slug: 'taxes', title: 'Tax', titleField: 'name',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, sortable: true },
      { name: 'percentage', label: 'Percentage', type: 'number', required: true, sortable: true },
      { name: 'additionReduction', label: 'Addition / Reduction', type: 'select', options: [...TAX_TYPES], sortable: true },
    ],
  },
  // Developer Menu: memakai halaman & endpoint master generik.
  {
    slug: 'email-templates', title: 'Email Template', titleField: 'description',
    help: 'Kategori reminder mengikuti Id template: 1 Expired Dokumen, 2 Pembuatan Invoice, 3 Pembayaran Invoice, 4 Expired ke-2, 5 EPO. @@ClientData@@ diganti tabel client, @@Keperluan@@ diganti nama kategori.',
    fields: [
      { name: 'id', label: 'Id', type: 'number', sortable: true, readOnly: true },
      { name: 'description', label: 'Template Description', type: 'text', required: true, sortable: true },
      { name: 'subject', label: 'Template Subject', type: 'text', required: true, help: 'Maksimal 40 karakter.' },
      { name: 'content', label: 'Content (HTML)', type: 'textarea', required: true, help: 'Wajib memuat @@ClientData@@.' },
    ],
  },
  {
    slug: 'email-recipients', title: 'Email Recipient', titleField: 'address',
    help: 'Penerima bertanda Accounting menerima reminder invoice (Pembuatan & Pembayaran Invoice); lainnya menerima reminder dokumen (Expired, Expired ke-2, EPO). Bila satu kelompok kosong, dipakai kelompok lainnya.',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, sortable: true },
      { name: 'address', label: 'Email', type: 'text', required: true, sortable: true },
      { name: 'isAccounting', label: 'Accounting', type: 'checkbox', sortable: true, defaultOff: true },
      { name: 'isActive', label: 'Is Active', type: 'checkbox', sortable: true },
    ],
  },
];

export const masterEntity = (slug: string) => MASTER_ENTITIES.find((e) => e.slug === slug);

export interface MasterOptions {
  sponsors: { id: number; name: string; isActive: boolean }[];
  billTos: { id: number; label: string; npwp: string | null }[];
  bankAccounts: { id: number; label: string }[];
  projects: { id: number; name: string; sponsorId: number; companyName: string | null; billToId: number | null }[];
  keperluan: { id: number; name: string; periode: number; periodeIn: string; sumberData: string; isActive: boolean }[];
  taxes: { id: number; name: string; percentage: number; type: string }[];
  companies: { id: number; name: string; bankAccountId: number | null; invoiceNoFormat: string }[];
}
