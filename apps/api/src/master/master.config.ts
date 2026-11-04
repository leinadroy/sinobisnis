import type { ClassConstructor } from 'class-transformer';
import type { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  BankAccountDto, BillToDto, CompanyDto, EmailRecipientDto, EmailTemplateDto, KeperluanDto, SponsorDto, SponsorProjectDto, TaxDto,
} from './master.dto.js';

type Order = Prisma.SortOrder;
type Row = Record<string, any>;

export interface MasterApiConfig {
  /** Nama delegate Prisma Client (prisma.<model>). */
  model: 'sponsor' | 'sponsorProject' | 'billTo' | 'keperluan' | 'company' | 'bankAccount' | 'tax' | 'emailTemplate' | 'emailRecipient';
  dto: ClassConstructor<object>;
  /** Filter pencarian teks bebas (collation MariaDB sudah tidak membedakan huruf besar/kecil). */
  search: (s: string) => Row[];
  /** Kolom yang boleh di-sort (id kolom dari web → orderBy Prisma). */
  sort: Record<string, (o: Order) => Row>;
  defaultSort: string;
  /** Baris yang selalu disembunyikan (placeholder "== Please Select ==" dari aplikasi lama). */
  where?: Row;
  include?: Row;
  /** Tambahan field tampilan untuk list (mis. nama relasi). */
  toRow?: (r: Row) => Row;
  /** Kolom teks yang boleh NULL; kolom teks lain diisi '' bila kosong (NOT NULL di production). */
  nullable?: string[];
  /** Nilai pengganti null untuk kolom angka / relasi NOT NULL. */
  defaults?: Row;
  /** Data tambahan saat insert (mis. id manual). */
  beforeCreate?: (prisma: PrismaService, data: Row) => Promise<Row>;
  /** Alasan tidak bisa dihapus (relasi tanpa foreign key di database lama), atau null. */
  inUse?: (prisma: PrismaService, id: number) => Promise<string | null>;
  /** Setelah update (mis. salinan nama di tabel client). */
  afterUpdate?: (prisma: PrismaService, row: Row) => Promise<void>;
}

const ci = (field: string) => (s: string) => ({ [field]: { contains: s } });
const by = (field: string) => (o: Order) => ({ [field]: o });
const notPlaceholder = (field: string) => ({ NOT: { [field]: { startsWith: '==' } } });
const used = (n: number, what: string) => (n ? `Masih dipakai ${n} ${what}.` : null);

export const MASTER_API: Record<string, MasterApiConfig> = {
  sponsors: {
    model: 'sponsor', dto: SponsorDto, defaultSort: 'name',
    search: (s) => [ci('name')(s)],
    sort: { name: by('name'), isActive: by('isActive') },
    defaults: { isActive: true },
    inUse: async (p, id) =>
      used(await p.client.count({ where: { sponsorId: id, isDelete: false } }), 'client') ??
      used(await p.invoice.count({ where: { sponsorId: id } }), 'invoice'),
    // Data client menyimpan salinan nama sponsor.
    afterUpdate: async (p, r) => { await p.client.updateMany({ where: { sponsorId: r.id }, data: { sponsor: r.name } }); },
  },
  'sponsor-projects': {
    model: 'sponsorProject', dto: SponsorProjectDto, defaultSort: 'name',
    include: { sponsor: { select: { name: true } } },
    search: (s) => [ci('name')(s), ci('companyName')(s), ci('kodePerusahaan')(s), { sponsor: ci('name')(s) }],
    sort: { name: by('name'), kodePerusahaan: by('kodePerusahaan'), companyName: by('companyName'), sponsorId: (o) => ({ sponsor: { name: o } }) },
    toRow: ({ sponsor, ...r }) => ({ ...r, sponsorName: sponsor?.name ?? null }),
    inUse: async (p, id) => used(await p.client.count({ where: { projectId: id, isDelete: false } }), 'client'),
  },
  'bill-to': {
    model: 'billTo', dto: BillToDto, defaultSort: 'companyName',
    where: notPlaceholder('companyName'),
    search: (s) => ['kodePerusahaan', 'companyName', 'npwp', 'alamat1'].map((f) => ci(f)(s)),
    sort: { kodePerusahaan: by('kodePerusahaan'), companyName: by('companyName') },
  },
  keperluan: {
    model: 'keperluan', dto: KeperluanDto, defaultSort: 'name',
    search: (s) => [ci('name')(s), ci('sumberData')(s)],
    sort: { name: by('name'), periode: by('periode'), isActive: by('isActive') },
    nullable: ['periode', 'periodeIn', 'sumberData'],
    defaults: { isActive: true, reminderExpiredDokumen: 0, reminderExpired2nd: 0, reminderPembuatanInvoice: 0, reminderPembayaranInvoice: 0, reminderEpo: 0 },
    // Data lama menyimpan 'MONTHS\t'; dirapikan supaya form & perhitungan expired konsisten.
    toRow: (r) => ({ ...r, periodeIn: r.periodeIn?.trim() || null, sumberData: r.sumberData?.trim() || null }),
    inUse: async (p, id) => used(await p.client.count({ where: { keperluanId: id, isDelete: false } }), 'client'),
    afterUpdate: async (p, r) => { await p.client.updateMany({ where: { keperluanId: r.id }, data: { keperluan: r.name } }); },
  },
  companies: {
    model: 'company', dto: CompanyDto, defaultSort: 'name',
    where: { id: { gt: 0 } },
    search: (s) => [ci('name')(s), ci('address')(s)],
    sort: { name: by('name') },
    defaults: { bankAccountId: 0, invoiceLastNo: 0, printFormat: 'ProcPrintInvoiceSML' },
    toRow: (r) => ({ ...r, bankAccountId: r.bankAccountId || null, bankAccountLabel: r.bankAccountLabel ?? null }),
    // CompanyId tidak auto increment di production.
    beforeCreate: async (p, data) => ({ ...data, id: ((await p.company.aggregate({ _max: { id: true } }))._max.id ?? 0) + 1 }),
    inUse: async (p, id) =>
      used(await p.invoice.count({ where: { companyId: id } }), 'invoice') ??
      used(await p.client.count({ where: { companyId: id } }), 'client'),
  },
  'bank-accounts': {
    model: 'bankAccount', dto: BankAccountDto, defaultSort: 'bankName',
    search: (s) => ['bankName', 'branch', 'accountFor', 'accountNo'].map((f) => ci(f)(s)),
    sort: { bankName: by('bankName'), accountFor: by('accountFor'), accountNo: by('accountNo') },
    nullable: ['branch', 'address1', 'address2', 'address3', 'address4', 'swiftcode'],
    inUse: async (p, id) => used(await p.company.count({ where: { bankAccountId: id } }), 'company'),
  },
  taxes: {
    model: 'tax', dto: TaxDto, defaultSort: 'name',
    search: (s) => [ci('name')(s)],
    sort: { name: by('name'), percentage: by('percentage'), additionReduction: by('additionReduction') },
    defaults: { additionReduction: 'ADDITION' },
  },
  'email-templates': {
    model: 'emailTemplate', dto: EmailTemplateDto, defaultSort: 'id',
    search: (s) => ['description', 'subject'].map((f) => ci(f)(s)),
    sort: { id: by('id'), description: by('description') },
  },
  'email-recipients': {
    model: 'emailRecipient', dto: EmailRecipientDto, defaultSort: 'name',
    search: (s) => ['name', 'address'].map((f) => ci(f)(s)),
    sort: { name: by('name'), address: by('address'), isAccounting: by('isAccounting'), isActive: by('isActive') },
    defaults: { isActive: true, isAccounting: false },
  },
};
