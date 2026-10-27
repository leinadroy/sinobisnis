import type { ClassConstructor } from 'class-transformer';
import type { Prisma } from '../generated/prisma/client.js';
import { BankAccountDto, BillToDto, CompanyDto, KeperluanDto, SponsorDto, SponsorProjectDto, TaxDto } from './master.dto.js';

type Order = Prisma.SortOrder;
type Row = Record<string, any>;

export interface MasterApiConfig {
  /** Nama delegate Prisma Client (prisma.<model>). */
  model: 'sponsor' | 'sponsorProject' | 'billTo' | 'keperluan' | 'company' | 'bankAccount' | 'tax';
  dto: ClassConstructor<object>;
  /** Filter pencarian teks bebas. */
  search: (s: string) => Row[];
  /** Kolom yang boleh di-sort (id kolom dari web → orderBy Prisma). */
  sort: Record<string, (o: Order) => Row>;
  defaultSort: string;
  include?: Row;
  /** Tambahan field tampilan untuk list (mis. nama relasi). */
  toRow?: (r: Row) => Row;
}

const ci = (field: string) => (s: string) => ({ [field]: { contains: s, mode: 'insensitive' } });
const by = (field: string) => (o: Order) => ({ [field]: o });

export const MASTER_API: Record<string, MasterApiConfig> = {
  sponsors: {
    model: 'sponsor', dto: SponsorDto, defaultSort: 'name',
    search: (s) => [ci('name')(s)],
    sort: { name: by('name') },
  },
  'sponsor-projects': {
    model: 'sponsorProject', dto: SponsorProjectDto, defaultSort: 'name',
    include: { sponsor: { select: { name: true } }, billTo: { select: { companyName: true } } },
    search: (s) => [ci('name')(s), { sponsor: ci('name')(s) }, { billTo: ci('companyName')(s) }],
    sort: { name: by('name'), sponsorId: (o) => ({ sponsor: { name: o } }), billToId: (o) => ({ billTo: { companyName: o } }) },
    toRow: ({ sponsor, billTo, ...r }) => ({ ...r, sponsorName: sponsor?.name ?? null, billToName: billTo?.companyName ?? null }),
  },
  'bill-to': {
    model: 'billTo', dto: BillToDto, defaultSort: 'companyName',
    search: (s) => ['kodePerusahaan', 'companyName', 'npwp', 'alamat1'].map((f) => ci(f)(s)),
    sort: { kodePerusahaan: by('kodePerusahaan'), companyName: by('companyName') },
  },
  keperluan: {
    model: 'keperluan', dto: KeperluanDto, defaultSort: 'name',
    search: (s) => [ci('name')(s), ci('sumberData')(s)],
    sort: { name: by('name'), periode: by('periode'), isActive: by('isActive'), harga: by('harga') },
  },
  companies: {
    model: 'company', dto: CompanyDto, defaultSort: 'name',
    include: { bankAccount: { select: { bankName: true, accountNo: true } } },
    search: (s) => [ci('name')(s), ci('address')(s)],
    sort: { name: by('name'), lastNo: by('lastNo') },
    toRow: ({ bankAccount, ...r }) => ({ ...r, bankAccountLabel: bankAccount ? `${bankAccount.bankName} _ ${bankAccount.accountNo ?? ''}` : null }),
  },
  'bank-accounts': {
    model: 'bankAccount', dto: BankAccountDto, defaultSort: 'bankName',
    search: (s) => ['bankName', 'branch', 'accountFor', 'accountNo'].map((f) => ci(f)(s)),
    sort: { bankName: by('bankName'), accountFor: by('accountFor'), accountNo: by('accountNo') },
  },
  taxes: {
    model: 'tax', dto: TaxDto, defaultSort: 'name',
    search: (s) => [ci('name')(s)],
    sort: { name: by('name'), percentage: by('percentage'), type: by('type') },
  },
};
