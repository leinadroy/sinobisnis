import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { masterEntity, type MasterOptions, type Paginated } from '@sml/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ListQueryDto, paginated } from '../common/list-query.dto.js';
import { validateBody } from '../common/validate.js';
import { MASTER_API, type MasterApiConfig } from './master.config.js';

type Row = Record<string, any>;

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Opsi dropdown Bill To. Nama yang dipakai lebih dari satu Bill To (mis. dua "Sinohydro Corporation Limited") diberi
 * pembeda supaya user tidak salah pilih: kode perusahaan / NPWP bila ada, dan selalu nomor id.
 */
export function billToOptions(billTos: { id: number; companyName: string; npwp: string; kodePerusahaan: string }[]) {
  const count = new Map<string, number>();
  for (const b of billTos) count.set(norm(b.companyName), (count.get(norm(b.companyName)) ?? 0) + 1);
  return billTos.map((b) => {
    const extra = (count.get(norm(b.companyName)) ?? 0) > 1
      ? ` (${[b.kodePerusahaan.trim(), b.npwp.trim() && `NPWP ${b.npwp.trim()}`, `#${b.id}`].filter(Boolean).join(' · ')})`
      : '';
    return { id: b.id, label: `${b.companyName}${extra}`, npwp: b.npwp || null };
  });
}

/** Pemakaian Bill To per sponsor di invoice: key `${sponsorId}:${billToId}` → nilai urut (makin besar makin baru). */
export type BillToUsage = Map<string, number>;

/** Dari invoice yang ada: kapan terakhir tiap sponsor memakai tiap Bill To (tanggal invoice, lalu id). */
export async function billToUsage(prisma: { $queryRaw: PrismaService['$queryRaw'] }): Promise<BillToUsage> {
  const rows = await prisma.$queryRaw<{ s: number; b: number; d: Date | null; i: bigint }[]>`
    SELECT InvoiceSponsorId AS s, BillToId AS b, MAX(InvoiceDate) AS d, MAX(InvoiceId) AS i FROM invoice
    WHERE BillToId > 0 AND InvoiceSponsorId > 0 GROUP BY InvoiceSponsorId, BillToId`;
  return new Map(rows.map((r) => [`${r.s}:${r.b}`, (r.d?.getTime() ?? 0) * 1e5 + Number(r.i)]));
}

/**
 * Bill To yang cocok untuk Sponsor Project (project menyimpan data perusahaan sendiri, bukan relasi):
 * nama perusahaan sama, lalu NPWP, lalu kode perusahaan. Satu yang cocok → dipakai. Lebih dari satu (mis. dua Bill To
 * bernama sama "Sinohydro Corporation Limited") → yang terakhir dipakai sponsor project itu di invoice; belum pernah
 * dipakai → lanjut ke kriteria berikutnya, akhirnya null (user memilih sendiri).
 */
export function matchBillTo(
  project: { companyName: string; npwp: string; kodePerusahaan: string; sponsorId?: number | null },
  billTos: { id: number; companyName: string; npwp: string; kodePerusahaan: string }[],
  usage?: BillToUsage,
): number | null {
  const pick = (xs: typeof billTos) => {
    if (xs.length === 1) return xs[0].id;
    if (!xs.length || !usage || !project.sponsorId) return null;
    let best: number | null = null;
    let bestAt = 0;
    for (const b of xs) {
      const at = usage.get(`${project.sponsorId}:${b.id}`) ?? 0;
      if (at > bestAt) [best, bestAt] = [b.id, at];
    }
    return best;
  };
  return pick(billTos.filter((b) => norm(b.companyName) && norm(b.companyName) === norm(project.companyName)))
    ?? pick(billTos.filter((b) => b.npwp.trim() && b.npwp.trim() === project.npwp.trim()))
    ?? pick(billTos.filter((b) => b.kodePerusahaan.trim() && b.kodePerusahaan.trim() === project.kodePerusahaan.trim()));
}

@Injectable()
export class MasterService {
  constructor(private readonly prisma: PrismaService) {}

  config(slug: string): MasterApiConfig {
    const cfg = MASTER_API[slug];
    if (!cfg) throw new NotFoundException('Master data tidak dikenal.');
    return cfg;
  }

  /** Delegate Prisma dipilih saat runtime (satu service untuk semua tabel master). */
  private delegate(cfg: MasterApiConfig): any {
    return (this.prisma as any)[cfg.model];
  }

  private async toRows(slug: string, cfg: MasterApiConfig, rows: Row[]) {
    let out = rows.map((r) => (cfg.toRow ? cfg.toRow(r) : r));
    // Company tidak punya relasi Prisma ke bankaccount (tanpa foreign key di production).
    if (slug === 'companies') {
      const banks = new Map((await this.prisma.bankAccount.findMany()).map((b) => [b.id, `${b.bankName} _ ${b.accountNo}`]));
      out = out.map((r) => ({ ...r, bankAccountLabel: r.bankAccountId ? banks.get(r.bankAccountId) ?? null : null }));
    }
    return out;
  }

  async list(slug: string, q: ListQueryDto): Promise<Paginated<Row>> {
    const cfg = this.config(slug);
    const s = q.search?.trim();
    const where = { AND: [cfg.where ?? {}, s ? { OR: cfg.search(s) } : {}] };
    const orderBy = (cfg.sort[q.sort ?? ''] ?? cfg.sort[cfg.defaultSort])(q.order);
    const d = this.delegate(cfg);
    const [rows, total] = await Promise.all([
      d.findMany({ where, orderBy: [orderBy, { id: 'asc' }], skip: q.skip, take: q.pageSize, include: cfg.include }),
      d.count({ where }),
    ]);
    return paginated(await this.toRows(slug, cfg, rows), total, q);
  }

  async get(slug: string, id: number) {
    const cfg = this.config(slug);
    const row = await this.delegate(cfg).findFirst({ where: { AND: [{ id }, cfg.where ?? {}] }, include: cfg.include });
    if (!row) throw new NotFoundException('Data tidak ditemukan.');
    return (await this.toRows(slug, cfg, [row]))[0];
  }

  /**
   * DTO → data Prisma mengikuti konvensi production: teks dipangkas, teks kosong = '' (kolom NOT NULL) atau null
   * (kolom yang ada di `nullable`); null untuk kolom angka/relasi NOT NULL diganti `defaults`.
   */
  private clean(slug: string, cfg: MasterApiConfig, dto: Row, isCreate: boolean) {
    const nullable = new Set(cfg.nullable ?? []);
    const readOnly = new Set(masterEntity(slug)?.fields.filter((f) => f.readOnly).map((f) => f.name));
    const data: Row = {};
    for (const [k, v] of Object.entries(dto)) {
      if (v === undefined || readOnly.has(k)) continue;
      if (typeof v === 'string') data[k] = v.trim() === '' && nullable.has(k) ? null : v.trim();
      else if (v === null) data[k] = nullable.has(k) ? null : cfg.defaults && k in cfg.defaults ? cfg.defaults[k] : '';
      else data[k] = v;
    }
    if (isCreate) for (const [k, v] of Object.entries(cfg.defaults ?? {})) if (data[k] === undefined) data[k] = v;
    // Kolom teks NOT NULL yang tidak dikirim saat insert diisi '' (mis. alamat Bill To).
    if (isCreate) {
      for (const f of masterEntity(slug)?.fields ?? []) {
        if (data[f.name] === undefined && (f.type === 'text' || f.type === 'textarea') && !nullable.has(f.name) && !f.readOnly) data[f.name] = '';
      }
    }
    return data;
  }

  async create(slug: string, body: unknown) {
    const cfg = this.config(slug);
    let data = this.clean(slug, cfg, await validateBody(cfg.dto, body), true);
    if (cfg.beforeCreate) data = await cfg.beforeCreate(this.prisma, data);
    try {
      const row = await this.delegate(cfg).create({ data, include: cfg.include });
      return (await this.toRows(slug, cfg, [row]))[0];
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async update(slug: string, id: number, body: unknown) {
    const cfg = this.config(slug);
    await this.get(slug, id);
    const data = this.clean(slug, cfg, await validateBody(cfg.dto, body, true), false);
    try {
      const row = await this.delegate(cfg).update({ where: { id }, data, include: cfg.include });
      if (cfg.afterUpdate) await cfg.afterUpdate(this.prisma, row);
      return (await this.toRows(slug, cfg, [row]))[0];
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async remove(slug: string, id: number) {
    const cfg = this.config(slug);
    await this.get(slug, id);
    const reason = cfg.inUse ? await cfg.inUse(this.prisma, id) : null;
    if (reason) throw new ConflictException(`${reason} Data tidak bisa dihapus.`);
    try {
      await this.delegate(cfg).delete({ where: { id } });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  /** Pilihan dropdown untuk semua form (client, master, invoice, kontrak). Placeholder lama disembunyikan. */
  async options(): Promise<MasterOptions> {
    const [sponsors, billTos, banks, projects, keperluan, taxes, companies, usage] = await Promise.all([
      this.prisma.sponsor.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, isActive: true } }),
      this.prisma.billTo.findMany({ where: { NOT: { companyName: { startsWith: '==' } } }, orderBy: { companyName: 'asc' } }),
      this.prisma.bankAccount.findMany({ orderBy: { bankName: 'asc' }, select: { id: true, bankName: true, accountNo: true } }),
      this.prisma.sponsorProject.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.keperluan.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.tax.findMany({ orderBy: { id: 'asc' } }),
      this.prisma.company.findMany({ where: { id: { gt: 0 } }, orderBy: { name: 'asc' }, select: { id: true, name: true, bankAccountId: true, invoiceNoFormat: true } }),
      billToUsage(this.prisma),
    ]);
    return {
      sponsors,
      billTos: billToOptions(billTos),
      bankAccounts: banks.map((b) => ({ id: b.id, label: `${b.bankName} _ ${b.accountNo}` })),
      projects: projects.map((p) => ({ id: p.id, name: p.name, sponsorId: p.sponsorId, companyName: p.companyName || null, billToId: matchBillTo(p, billTos, usage) })),
      keperluan: keperluan.map((k) => ({
        id: k.id, name: k.name, periode: k.periode ?? 0, periodeIn: k.periodeIn?.trim() || 'MONTHS',
        sumberData: k.sumberData?.trim() || 'TANGGAL TERBIT DOKUMEN', isActive: k.isActive,
      })),
      taxes: taxes.map((t) => ({ id: t.id, name: t.name, percentage: t.percentage, type: t.additionReduction })),
      companies: companies.map((c) => ({ ...c, bankAccountId: c.bankAccountId || null })),
    };
  }

  private mapError(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2025') return new NotFoundException('Data tidak ditemukan.');
      if (e.code === 'P2003') return new ConflictException('Data masih dipakai di data lain sehingga tidak bisa dihapus/diubah.');
      if (e.code === 'P2002') return new ConflictException('Data dengan nilai yang sama sudah ada.');
      if (e.code === 'P2000') return new ConflictException('Ada isian yang terlalu panjang untuk kolom database.');
    }
    return e;
  }
}
