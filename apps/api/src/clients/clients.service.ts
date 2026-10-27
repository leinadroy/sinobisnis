import fs from 'node:fs';
import path from 'node:path';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CLIENT_DATE_FIELDS, CLIENT_TEXT_FIELDS, computeExpired,
  type ClientDetail, type ClientLogRow, type ClientRow, type Paginated, type PersonRow,
} from '@sml/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ListQueryDto, paginated } from '../common/list-query.dto.js';
import type { ClientDto, ClientListQueryDto } from './clients.dto.js';

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'storage/uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const include = {
  sponsor: { select: { name: true } },
  project: { select: { name: true } },
  keperluan: { select: { name: true } },
  _count: { select: { attachments: true } },
} satisfies Prisma.ClientInclude;
type ClientWithRel = Prisma.ClientGetPayload<{ include: typeof include }>;

const d2s = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const s2d = (s: string | null | undefined) => (s ? new Date(s + 'T00:00:00Z') : null);

export function toRow(c: ClientWithRel): ClientRow {
  const dates = Object.fromEntries(CLIENT_DATE_FIELDS.map((f) => [f, d2s(c[f])]));
  return {
    id: c.id, sponsorId: c.sponsorId, sponsorName: c.sponsor?.name ?? null, projectId: c.projectId, projectName: c.project?.name ?? null,
    keperluanId: c.keperluanId, keperluanName: c.keperluan?.name ?? null, name: c.name, noPaspor: c.noPaspor,
    noRptka: c.noRptka, permohonanHariKe3: c.permohonanHariKe3, epo: c.epo, noInvoice: c.noInvoice, keteranganTka: c.keteranganTka,
    prosesPerpanjangan: c.prosesPerpanjangan, status: c.status, sktt: c.sktt, stm: c.stm, isArchived: c.isArchived,
    archivedReason: c.archivedReason, invoiceId: c.invoiceId, attachmentCount: c._count.attachments,
    ...(dates as Pick<ClientRow, 'tanggalPermohonan' | 'tanggalLahir' | 'tanggalProsesSelesai' | 'expiredDokumen' | 'tanggalInvoice' | 'tanggalPembayaranInvoice' | 'tanggalTerbitDokumen' | 'tanggalMasukLastExp'>),
  };
}

const SORT: Record<string, (o: Prisma.SortOrder) => Prisma.ClientOrderByWithRelationInput> = {
  sponsorName: (o) => ({ sponsor: { name: o } }),
  projectName: (o) => ({ project: { name: o } }),
  keperluanName: (o) => ({ keperluan: { name: o } }),
};
const DIRECT_SORT = new Set(['id', 'name', 'noPaspor', 'noRptka', 'noInvoice', 'status', 'epo', 'sktt', 'stm', ...CLIENT_DATE_FIELDS]);

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  private where(q: ClientListQueryDto, archived: boolean): Prisma.ClientWhereInput {
    const and: Prisma.ClientWhereInput[] = [{ isArchived: archived }];
    const s = q.search?.trim();
    if (s) {
      const ci = { contains: s, mode: 'insensitive' as const };
      and.push({
        OR: [
          { name: ci }, { noPaspor: ci }, { noRptka: ci }, { noInvoice: ci }, { status: ci }, { keteranganTka: ci },
          { sponsor: { name: ci } }, { project: { name: ci } }, { keperluan: { name: ci } },
          ...(/^\d+$/.test(s) ? [{ id: Number(s) }] : []),
        ],
      });
    }
    if (q.sponsorId) and.push({ sponsorId: q.sponsorId });
    if (q.keperluanId) and.push({ keperluanId: q.keperluanId });
    if (q.from) and.push({ tanggalPermohonan: { gte: s2d(q.from)! } });
    if (q.to) and.push({ tanggalPermohonan: { lte: s2d(q.to)! } });
    if (q.expiring !== undefined) {
      const until = new Date();
      until.setUTCHours(0, 0, 0, 0);
      until.setUTCDate(until.getUTCDate() + q.expiring);
      and.push({ expiredDokumen: { not: null, lte: until } });
    }
    if (q.uninvoiced) and.push({ tanggalProsesSelesai: { not: null }, OR: [{ noInvoice: null }, { noInvoice: '' }] });
    if (q.unpaid) and.push({ tanggalInvoice: { not: null }, tanggalPembayaranInvoice: null });
    return { AND: and };
  }

  private orderBy(q: ListQueryDto): Prisma.ClientOrderByWithRelationInput[] {
    const o = q.order;
    if (q.sort && SORT[q.sort]) return [SORT[q.sort](o), { id: 'desc' }];
    if (q.sort && DIRECT_SORT.has(q.sort)) return [{ [q.sort]: { sort: o, nulls: 'last' } } as Prisma.ClientOrderByWithRelationInput, { id: 'desc' }];
    return [{ id: 'desc' }];
  }

  async list(q: ClientListQueryDto, archived: boolean): Promise<Paginated<ClientRow>> {
    const where = this.where(q, archived);
    const [rows, total] = await Promise.all([
      this.prisma.client.findMany({ where, include, orderBy: this.orderBy(q), skip: q.skip, take: q.pageSize }),
      this.prisma.client.count({ where }),
    ]);
    return paginated(rows.map(toRow), total, q);
  }

  /** Semua baris sesuai filter (untuk export), dibatasi supaya tidak membebani server. */
  async exportRows(q: ClientListQueryDto, archived: boolean) {
    const rows = await this.prisma.client.findMany({ where: this.where(q, archived), include, orderBy: this.orderBy(q), take: 50_000 });
    return rows.map(toRow);
  }

  /** Client List: orang unik (nama + paspor) beserta jumlah permohonannya. */
  async people(q: ListQueryDto): Promise<Paginated<PersonRow>> {
    const s = q.search?.trim();
    const where: Prisma.ClientWhereInput = s
      ? { OR: [{ name: { contains: s, mode: 'insensitive' } }, { noPaspor: { contains: s, mode: 'insensitive' } }] }
      : {};
    const order = q.order;
    const [groups, all] = await Promise.all([
      this.prisma.client.groupBy({
        by: ['name', 'noPaspor'], where, _count: { _all: true }, _max: { id: true, tanggalLahir: true },
        orderBy: q.sort === 'jumlah' ? { _count: { id: order } } : q.sort === 'noPaspor' ? { noPaspor: order } : { name: order },
        skip: q.skip, take: q.pageSize,
      }),
      this.prisma.client.groupBy({ by: ['name', 'noPaspor'], where }),
    ]);
    const data = groups.map((g) => ({
      name: g.name, noPaspor: g.noPaspor, tanggalLahir: d2s(g._max.tanggalLahir), jumlah: g._count._all, lastId: g._max.id!,
    }));
    return paginated(data, all.length, q);
  }

  async get(id: number): Promise<ClientDetail> {
    const c = await this.prisma.client.findUnique({
      where: { id },
      include: { ...include, attachments: { orderBy: { id: 'asc' } }, conversations: { orderBy: { id: 'asc' } } },
    });
    if (!c) throw new NotFoundException('Client tidak ditemukan.');
    const history = await this.prisma.clientLog.findMany({
      where: { clientId: id }, orderBy: { id: 'desc' }, take: 20, select: { id: true, historyDate: true, userName: true, action: true },
    });
    return {
      ...toRow(c),
      pembayaranPnbp: d2s(c.pembayaranPnbp),
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      attachments: c.attachments.map((a) => ({ id: a.id, originalName: a.originalName, mime: a.mime, size: a.size, uploadedAt: a.uploadedAt.toISOString() })),
      conversations: c.conversations.map((m) => ({ id: m.id, userName: m.userName, message: m.message, createdAt: m.createdAt.toISOString() })),
      history: history.map((h) => ({ ...h, historyDate: h.historyDate.toISOString() })),
    };
  }

  /** DTO → data Prisma: tanggal string → Date, '' → null; Expired dihitung otomatis bila kosong. */
  private async toData(dto: ClientDto, existing?: ClientWithRel) {
    const data: Record<string, unknown> = {};
    // Field class DTO selalu ada (bernilai undefined) setelah plainToInstance, jadi cek nilainya, bukan keberadaan key.
    const given = (k: string) => (dto as Record<string, unknown>)[k] !== undefined;
    for (const f of CLIENT_TEXT_FIELDS) if (given(f)) data[f] = typeof dto[f] === 'string' ? (dto[f] as string).trim() || null : null;
    for (const f of CLIENT_DATE_FIELDS) if (given(f)) data[f] = s2d(dto[f] || null);
    for (const f of ['sponsorId', 'projectId', 'keperluanId'] as const) if (given(f)) data[f] = dto[f] || null;
    if (given('isArchived')) data.isArchived = !!dto.isArchived;
    if (data.name === null) throw new BadRequestException('Nama Client wajib diisi.');

    // Nilai akhir (gabungan data lama + perubahan) untuk menghitung Expired Dokumen.
    const changes = Object.entries(dto).filter(([, v]) => v !== undefined).map(([k, v]) => [k, v === '' ? null : v]);
    const merged = { ...(existing ? toRow(existing) : {}), ...Object.fromEntries(changes) } as Record<string, any>;
    if (!merged.expiredDokumen && merged.keperluanId) {
      const k = await this.prisma.keperluan.findUnique({ where: { id: merged.keperluanId } });
      const auto = computeExpired(merged, k);
      if (auto) data.expiredDokumen = s2d(auto);
    }
    // Project harus milik sponsor yang dipilih.
    if (merged.projectId && merged.sponsorId) {
      const p = await this.prisma.sponsorProject.findUnique({ where: { id: merged.projectId } });
      if (p && p.sponsorId !== merged.sponsorId) throw new BadRequestException('Project tidak sesuai dengan Sponsor yang dipilih.');
    }
    return data;
  }

  private async log(userName: string, clientId: number, action: string) {
    const c = await this.prisma.client.findUnique({ where: { id: clientId }, include });
    await this.prisma.clientLog.create({
      data: { userName, clientId, action, snapshot: c ? (toRow(c) as unknown as Prisma.InputJsonValue) : Prisma.JsonNull },
    });
  }

  async create(dto: ClientDto, userName: string) {
    const data = await this.toData(dto);
    const c = await this.prisma.client.create({ data: data as Prisma.ClientUncheckedCreateInput });
    await this.log(userName, c.id, 'INSERT');
    return this.get(c.id);
  }

  async update(id: number, dto: ClientDto, userName: string) {
    const existing = await this.prisma.client.findUnique({ where: { id }, include });
    if (!existing) throw new NotFoundException('Client tidak ditemukan.');
    const data = await this.toData(dto, existing);
    await this.prisma.client.update({ where: { id }, data: data as Prisma.ClientUncheckedUpdateInput });
    await this.log(userName, id, 'UPDATE');
    return this.get(id);
  }

  async remove(id: number, userName: string) {
    const c = await this.prisma.client.findUnique({ where: { id }, include: { attachments: true } });
    if (!c) throw new NotFoundException('Client tidak ditemukan.');
    if (c.invoiceId) throw new BadRequestException('Client sudah masuk invoice. Hapus/ubah invoice-nya terlebih dahulu.');
    await this.log(userName, id, 'DELETE');
    await this.prisma.client.delete({ where: { id } });
    c.attachments.forEach((a) => fs.rm(path.join(UPLOAD_DIR, a.storedName), () => {}));
  }

  async archive(id: number, archive: boolean, reason: string | undefined, userName: string) {
    await this.prisma.client.update({ where: { id }, data: { isArchived: archive, archivedReason: archive ? reason?.trim() || null : null } })
      .catch(() => { throw new NotFoundException('Client tidak ditemukan.'); });
    await this.log(userName, id, archive ? 'ARCHIVE' : 'UNARCHIVE');
  }

  async addConversation(clientId: number, message: string, userName: string) {
    await this.ensure(clientId);
    const m = await this.prisma.conversation.create({ data: { clientId, message: message.trim(), userName } });
    return { id: m.id, userName: m.userName, message: m.message, createdAt: m.createdAt.toISOString() };
  }

  async addAttachments(clientId: number, files: Express.Multer.File[], userName: string) {
    await this.ensure(clientId);
    if (!files?.length) throw new BadRequestException('Tidak ada file yang diunggah.');
    await this.prisma.clientAttachment.createMany({
      data: files.map((f) => ({ clientId, originalName: Buffer.from(f.originalname, 'latin1').toString('utf8'), storedName: f.filename, mime: f.mimetype, size: f.size })),
    });
    await this.log(userName, clientId, 'ATTACHMENT');
    return (await this.get(clientId)).attachments;
  }

  async attachment(aid: number) {
    const a = await this.prisma.clientAttachment.findUnique({ where: { id: aid } });
    if (!a) throw new NotFoundException('Lampiran tidak ditemukan.');
    const file = path.join(UPLOAD_DIR, a.storedName);
    if (!fs.existsSync(file)) throw new NotFoundException('File lampiran tidak ada di penyimpanan.');
    return { ...a, file };
  }

  async removeAttachment(aid: number, userName: string) {
    const row = await this.prisma.clientAttachment.findUnique({ where: { id: aid } });
    if (!row) throw new NotFoundException('Lampiran tidak ditemukan.');
    await this.prisma.clientAttachment.delete({ where: { id: aid } });
    fs.rm(path.join(UPLOAD_DIR, row.storedName), () => {});
    await this.log(userName, row.clientId, 'ATTACHMENT_DELETE');
  }

  async logs(q: ListQueryDto): Promise<Paginated<ClientLogRow>> {
    const s = q.search?.trim();
    const where: Prisma.ClientLogWhereInput = s
      ? { OR: [
          { userName: { contains: s, mode: 'insensitive' } },
          { action: { contains: s, mode: 'insensitive' } },
          { snapshot: { path: ['name'], string_contains: s } },
          ...(/^\d+$/.test(s) ? [{ clientId: Number(s) }] : []),
        ] }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.clientLog.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.pageSize }),
      this.prisma.clientLog.count({ where }),
    ]);
    return paginated(rows.map((r) => ({
      id: r.id, historyDate: r.historyDate.toISOString(), userName: r.userName, clientId: r.clientId, action: r.action,
      snapshot: (r.snapshot as Partial<ClientRow> | null) ?? null,
    })), total, q);
  }

  private async ensure(id: number) {
    if (!(await this.prisma.client.count({ where: { id } }))) throw new NotFoundException('Client tidak ditemukan.');
  }
}
