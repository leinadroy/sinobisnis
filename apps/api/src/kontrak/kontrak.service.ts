import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { KontrakDetail, KontrakRow, Paginated, PriceListItem } from '@sml/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { d2s, s2d } from '../common/dates.js';
import { ListQueryDto, paginated } from '../common/list-query.dto.js';
import type { KontrakDto } from './kontrak.dto.js';

const include = {
  billTo: { select: { companyName: true } },
  _count: { select: { items: true } },
} satisfies Prisma.KontrakInclude;
type KontrakWithRel = Prisma.KontrakGetPayload<{ include: typeof include }>;

const toRow = (k: KontrakWithRel): KontrakRow => ({
  id: k.id, date: d2s(k.date), billToId: k.billToId, billToName: k.billTo.companyName, alamat: k.alamat, isi: k.isi, itemCount: k._count.items,
});

const SORT: Record<string, (o: Prisma.SortOrder) => Prisma.KontrakOrderByWithRelationInput> = {
  id: (o) => ({ id: o }),
  date: (o) => ({ date: { sort: o, nulls: 'last' } }),
  billToName: (o) => ({ billTo: { companyName: o } }),
  itemCount: (o) => ({ items: { _count: o } }),
};

@Injectable()
export class KontrakService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListQueryDto): Promise<Paginated<KontrakRow>> {
    const s = q.search?.trim();
    const ci = { contains: s, mode: 'insensitive' as const };
    const where: Prisma.KontrakWhereInput = s ? { OR: [{ billTo: { companyName: ci } }, { alamat: ci }, { isi: ci }] } : {};
    const orderBy = q.sort && SORT[q.sort] ? [SORT[q.sort](q.order), { id: 'desc' as const }] : [{ date: { sort: 'desc' as const, nulls: 'last' as const } }, { id: 'desc' as const }];
    const [rows, total] = await Promise.all([
      this.prisma.kontrak.findMany({ where, include, orderBy, skip: q.skip, take: q.pageSize }),
      this.prisma.kontrak.count({ where }),
    ]);
    return paginated(rows.map(toRow), total, q);
  }

  async get(id: number): Promise<KontrakDetail> {
    const k = await this.prisma.kontrak.findUnique({ where: { id }, include: { ...include, items: { orderBy: [{ seq: 'asc' }, { id: 'asc' }] } } });
    if (!k) throw new NotFoundException('Kontrak tidak ditemukan.');
    return {
      ...toRow(k),
      items: k.items.map((i) => ({ id: i.id, keperluanId: i.keperluanId, description: i.description, duration: i.duration, price: i.price.toNumber() })),
    };
  }

  /** Validasi + lengkapi data: alamat default dari Bill To, nama item default dari Keperluan. */
  private async prepare(dto: KontrakDto) {
    const billTo = await this.prisma.billTo.findUnique({ where: { id: dto.billToId } });
    if (!billTo) throw new BadRequestException('Bill To tidak ditemukan.');
    const alamat = dto.alamat?.trim() || [billTo.alamat1, billTo.alamat2, billTo.alamat3, billTo.alamat4].filter(Boolean).join(', ') || null;

    const kepIds = [...new Set(dto.items.map((i) => i.keperluanId).filter((x): x is number => !!x))];
    const keperluan = kepIds.length ? await this.prisma.keperluan.findMany({ where: { id: { in: kepIds } }, select: { id: true, name: true } }) : [];
    if (keperluan.length !== kepIds.length) throw new BadRequestException('Ada Keperluan yang tidak ditemukan.');

    const items = dto.items
      .map((i) => ({
        keperluanId: i.keperluanId || null,
        description: i.description?.trim() || keperluan.find((k) => k.id === i.keperluanId)?.name || '',
        duration: i.duration?.trim() || null,
        price: i.price,
      }))
      .filter((i) => i.description);
    const names = items.map((i) => i.description.toLowerCase());
    const dup = names.find((n, idx) => names.indexOf(n) !== idx);
    if (dup) throw new BadRequestException(`Layanan "${items[names.indexOf(dup)].description}" tercantum lebih dari sekali.`);
    return {
      header: { date: s2d(dto.date), billToId: dto.billToId, alamat, isi: dto.isi?.trim() || null },
      items: items.map((i, idx) => ({ ...i, seq: idx + 1 })),
    };
  }

  async create(dto: KontrakDto) {
    const { header, items } = await this.prepare(dto);
    const k = await this.prisma.kontrak.create({ data: { ...header, items: { create: items } } });
    return this.get(k.id);
  }

  async update(id: number, dto: KontrakDto) {
    await this.ensure(id);
    const { header, items } = await this.prepare(dto);
    await this.prisma.$transaction(async (tx) => {
      await tx.kontrakItem.deleteMany({ where: { kontrakId: id } });
      await tx.kontrak.update({ where: { id }, data: { ...header, items: { create: items } } });
    });
    return this.get(id);
  }

  async remove(id: number) {
    await this.ensure(id);
    await this.prisma.kontrak.delete({ where: { id } });
  }

  /**
   * Harga yang berlaku untuk satu Bill To per tanggal: item dari kontrak terbaru (tanggal ≤ date) per nama layanan.
   * Kontrak tanpa tanggal dianggap paling lama.
   */
  async priceList(billToId: number | null | undefined, date?: string | null): Promise<PriceListItem[]> {
    if (!billToId) return [];
    const rows = await this.prisma.kontrakItem.findMany({
      where: { kontrak: { billToId, ...(date ? { OR: [{ date: null }, { date: { lte: s2d(date)! } }] } : {}) } },
      include: { kontrak: { select: { date: true } } },
      orderBy: [{ kontrak: { date: { sort: 'desc', nulls: 'last' } } }, { kontrak: { id: 'desc' } }, { seq: 'asc' }],
    });
    const seen = new Set<string>();
    return rows
      .filter((r) => {
        const key = r.description.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((r) => ({ description: r.description, keperluanId: r.keperluanId, duration: r.duration, price: r.price.toNumber(), kontrakDate: d2s(r.kontrak.date) }));
  }

  private async ensure(id: number) {
    if (!(await this.prisma.kontrak.count({ where: { id } }))) throw new NotFoundException('Kontrak tidak ditemukan.');
  }
}
