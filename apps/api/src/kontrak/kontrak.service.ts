import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { KontrakDetail, KontrakRow, Paginated, PriceListItem } from '@sml/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { d2s, s2d } from '../common/dates.js';
import { ListQueryDto, paginated } from '../common/list-query.dto.js';
import type { KontrakDto } from './kontrak.dto.js';

const include = {
  billTo: { select: { companyName: true } },
  _count: { select: { details: true } },
} satisfies Prisma.KontrakInclude;
type KontrakWithRel = Prisma.KontrakGetPayload<{ include: typeof include }>;

const toRow = (k: KontrakWithRel): KontrakRow => ({
  id: k.id, date: d2s(k.date), billToId: k.billToId, billToName: k.billTo.companyName, nomor: k.nomor?.trim() || null, itemCount: k._count.details,
});

const SORT: Record<string, (o: Prisma.SortOrder) => Prisma.KontrakOrderByWithRelationInput> = {
  id: (o) => ({ id: o }),
  date: (o) => ({ date: o }),
  billToName: (o) => ({ billTo: { companyName: o } }),
  itemCount: (o) => ({ details: { _count: o } }),
};

@Injectable()
export class KontrakService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListQueryDto): Promise<Paginated<KontrakRow>> {
    const s = q.search?.trim();
    const where: Prisma.KontrakWhereInput = s ? { OR: [{ billTo: { companyName: { contains: s } } }, { nomor: { contains: s } }] } : {};
    const orderBy = q.sort && SORT[q.sort] ? [SORT[q.sort](q.order), { id: 'desc' as const }] : [{ date: 'desc' as const }, { id: 'desc' as const }];
    const [rows, total] = await Promise.all([
      this.prisma.kontrak.findMany({ where, include, orderBy, skip: q.skip, take: q.pageSize }),
      this.prisma.kontrak.count({ where }),
    ]);
    return paginated(rows.map(toRow), total, q);
  }

  async get(id: number): Promise<KontrakDetail> {
    const k = await this.prisma.kontrak.findUnique({
      where: { id }, include: { ...include, details: { orderBy: { id: 'asc' }, include: { keperluan: { select: { name: true } } } } },
    });
    if (!k) throw new NotFoundException('Kontrak tidak ditemukan.');
    return {
      ...toRow(k),
      items: k.details.map((d) => ({ id: d.id, keperluanId: d.keperluanId, description: d.keperluan.name, duration: d.duration || null, price: Number(d.price ?? 0) })),
    };
  }

  private async prepare(dto: KontrakDto) {
    if (!(await this.prisma.billTo.count({ where: { id: dto.billToId } }))) throw new BadRequestException('Bill To tidak ditemukan.');
    const ids = dto.items.map((i) => i.keperluanId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Satu Keperluan hanya boleh sekali dalam satu kontrak.');
    if (ids.length && (await this.prisma.keperluan.count({ where: { id: { in: ids } } })) !== ids.length) throw new BadRequestException('Ada Keperluan yang tidak ditemukan.');
    return {
      header: { date: s2d(dto.date), billToId: dto.billToId, nomor: dto.nomor?.trim() || null },
      details: dto.items.map((i, idx) => ({ id: idx + 1, keperluanId: i.keperluanId, duration: i.duration?.trim() ?? '', price: BigInt(Math.round(i.price)) })),
    };
  }

  async create(dto: KontrakDto) {
    const { header, details } = await this.prepare(dto);
    const k = await this.prisma.kontrak.create({ data: { ...header, line: details.length, details: { create: details } } });
    return this.get(k.id);
  }

  async update(id: number, dto: KontrakDto) {
    await this.ensure(id);
    const { header, details } = await this.prepare(dto);
    await this.prisma.$transaction(async (tx) => {
      await tx.kontrakDetail.deleteMany({ where: { kontrakId: id } });
      await tx.kontrak.update({ where: { id }, data: { ...header, line: details.length, details: { create: details } } });
    });
    return this.get(id);
  }

  async remove(id: number) {
    await this.ensure(id);
    await this.prisma.$transaction([
      this.prisma.kontrakDetail.deleteMany({ where: { kontrakId: id } }),
      this.prisma.kontrak.delete({ where: { id } }),
    ]);
  }

  /**
   * Harga yang berlaku untuk satu Bill To per tanggal: per Keperluan, dari kontrak terbaru (tanggal ≤ date).
   * Kontrak tanpa tanggal dianggap paling lama.
   */
  async priceList(billToId: number | null | undefined, date?: string | null): Promise<PriceListItem[]> {
    if (!billToId) return [];
    const rows = await this.prisma.kontrakDetail.findMany({
      where: { kontrak: { billToId, ...(date ? { OR: [{ date: null }, { date: { lte: s2d(date)! } }] } : {}) } },
      include: { kontrak: { select: { id: true, date: true } }, keperluan: { select: { name: true } } },
    });
    rows.sort((a, b) => (b.kontrak.date?.getTime() ?? 0) - (a.kontrak.date?.getTime() ?? 0) || b.kontrak.id - a.kontrak.id);
    const seen = new Set<number>();
    return rows
      .filter((r) => !seen.has(r.keperluanId) && seen.add(r.keperluanId))
      .map((r) => ({ description: r.keperluan.name, keperluanId: r.keperluanId, duration: r.duration || null, price: Number(r.price ?? 0), kontrakDate: d2s(r.kontrak.date) }));
  }

  private async ensure(id: number) {
    if (!(await this.prisma.kontrak.count({ where: { id } }))) throw new NotFoundException('Kontrak tidak ditemukan.');
  }
}
