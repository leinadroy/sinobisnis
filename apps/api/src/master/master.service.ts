import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { masterEntity, type MasterOptions, type Paginated } from '@sml/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ListQueryDto, paginated } from '../common/list-query.dto.js';
import { validateBody } from '../common/validate.js';
import { MASTER_API, type MasterApiConfig } from './master.config.js';

type Row = Record<string, any>;

@Injectable()
export class MasterService {
  constructor(private readonly prisma: PrismaService) {}

  config(slug: string): MasterApiConfig {
    const cfg = MASTER_API[slug];
    if (!cfg) throw new NotFoundException('Master data tidak dikenal.');
    return cfg;
  }

  /** Delegate Prisma dipilih saat runtime (satu service untuk 7 tabel master). */
  private delegate(cfg: MasterApiConfig): any {
    return (this.prisma as any)[cfg.model];
  }

  private toRow(cfg: MasterApiConfig, r: Row) {
    return cfg.toRow ? cfg.toRow(r) : r;
  }

  async list(slug: string, q: ListQueryDto): Promise<Paginated<Row>> {
    const cfg = this.config(slug);
    const s = q.search?.trim();
    const where = s ? { OR: cfg.search(s) } : {};
    const orderBy = (cfg.sort[q.sort ?? ''] ?? cfg.sort[cfg.defaultSort])(q.order);
    const d = this.delegate(cfg);
    const [rows, total] = await Promise.all([
      d.findMany({ where, orderBy: [orderBy, { id: 'asc' }], skip: q.skip, take: q.pageSize, include: cfg.include }),
      d.count({ where }),
    ]);
    return paginated(rows.map((r: Row) => this.toRow(cfg, r)), total, q);
  }

  async get(slug: string, id: number) {
    const cfg = this.config(slug);
    const row = await this.delegate(cfg).findUnique({ where: { id }, include: cfg.include });
    if (!row) throw new NotFoundException('Data tidak ditemukan.');
    return this.toRow(cfg, row);
  }

  /** String kosong → null untuk field opsional; spasi di ujung dipangkas. */
  private clean(slug: string, dto: Row) {
    const required = new Set(masterEntity(slug)?.fields.filter((f) => f.required).map((f) => f.name));
    return Object.fromEntries(
      Object.entries(dto).map(([k, v]) => {
        if (typeof v !== 'string') return [k, v];
        const t = v.trim();
        return [k, t === '' && !required.has(k) ? null : t];
      }),
    );
  }

  async create(slug: string, body: unknown) {
    const cfg = this.config(slug);
    const data = this.clean(slug, await validateBody(cfg.dto, body));
    try {
      return this.toRow(cfg, await this.delegate(cfg).create({ data, include: cfg.include }));
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async update(slug: string, id: number, body: unknown) {
    const cfg = this.config(slug);
    const data = this.clean(slug, await validateBody(cfg.dto, body, true));
    try {
      return this.toRow(cfg, await this.delegate(cfg).update({ where: { id }, data, include: cfg.include }));
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async remove(slug: string, id: number) {
    const cfg = this.config(slug);
    try {
      await this.delegate(cfg).delete({ where: { id } });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  /** Pilihan dropdown untuk semua form (client, master, invoice). */
  async options(): Promise<MasterOptions> {
    const [sponsors, billTos, banks, projects, keperluan, taxes] = await Promise.all([
      this.prisma.sponsor.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      this.prisma.billTo.findMany({ orderBy: { companyName: 'asc' }, select: { id: true, companyName: true, npwp: true } }),
      this.prisma.bankAccount.findMany({ orderBy: { bankName: 'asc' }, select: { id: true, bankName: true, accountNo: true } }),
      this.prisma.sponsorProject.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, sponsorId: true, billToId: true } }),
      this.prisma.keperluan.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.tax.findMany({ orderBy: { id: 'asc' } }),
    ]);
    return {
      sponsors,
      billTos: billTos.map((b) => ({ id: b.id, label: b.companyName, npwp: b.npwp })),
      bankAccounts: banks.map((b) => ({ id: b.id, label: `${b.bankName} _ ${b.accountNo ?? ''}` })),
      projects,
      keperluan: keperluan.map((k) => ({
        id: k.id, name: k.name, periode: k.periode, periodeIn: k.periodeIn, sumberData: k.sumberData, harga: k.harga.toNumber(), isActive: k.isActive,
      })),
      taxes: taxes.map((t) => ({ id: t.id, name: t.name, percentage: t.percentage.toNumber(), type: t.type })),
    };
  }

  private mapError(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2025') return new NotFoundException('Data tidak ditemukan.');
      if (e.code === 'P2003') return new ConflictException('Data masih dipakai di data lain sehingga tidak bisa dihapus/diubah.');
      if (e.code === 'P2002') return new ConflictException('Data dengan nilai yang sama sudah ada.');
    }
    return e;
  }
}
