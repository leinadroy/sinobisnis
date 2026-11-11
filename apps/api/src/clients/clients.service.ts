import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CLIENT_DATE_FIELDS, CLIENT_TEXT_FIELDS, computeExpired, todayStr,
  type ClientAttachmentRow, type ClientDetail, type ClientLogRow, type ClientRow, type Paginated, type PersonRow,
} from '@sml/shared';
import { Prisma, type Client } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { d2s, dt2s, GX_EMPTY_DATE, s2d } from '../common/dates.js';
import { ListQueryDto, paginated } from '../common/list-query.dto.js';
import type { ClientDto, ClientListQueryDto } from './clients.dto.js';

/** Tanggal "berisi" (bukan NULL / 1000-01-01 khas GeneXus). */
const VALID_DATE = { gte: new Date('1900-01-01T00:00:00Z') };
const EMPTY_TEXT: Prisma.ClientWhereInput[] = [{ noInvoice: null }, { noInvoice: '' }];

/** Kolom client (nama field Prisma) ↔ key SDT GeneXus di datalog (format log aplikasi lama). */
const GX_KEYS: Record<string, keyof ClientRow | 'pembayaranPnbp'> = {
  ClientNo: 'id', ClientSponsorId: 'sponsorId', ClientSponsor: 'sponsorName', ClientProjectId: 'projectId', ClientTanggalPermohonan: 'tanggalPermohonan',
  ClientPembayaranPNBP: 'pembayaranPnbp', ClientPermohonanHariKe3: 'permohonanHariKe3', ClientName: 'name', ClientNoPaspor: 'noPaspor',
  ClientTanggalLahir: 'tanggalLahir', ClientNoRPTKA: 'noRptka', ClientKeperluanId: 'keperluanId', ClientKeperluan: 'keperluanName',
  ClientTanggalProsesSelesai: 'tanggalProsesSelesai', ClientTanggalTerbitDokumen: 'tanggalTerbitDokumen', ClientTanggalMasukLastExp: 'tanggalMasukLastExp',
  ClientExpiredDokumen: 'expiredDokumen', ClientEPO: 'epo', ClientNoInvoice: 'noInvoice', ClientTanggalInvoice: 'tanggalInvoice',
  ClientTanggalPembayaranInvoice: 'tanggalPembayaranInvoice', ClientProsesPerpanjangan: 'prosesPerpanjangan', ClientKeteranganTKA: 'keteranganTka',
  ClientStatus: 'status', ClientSKTT: 'sktt', ClientSTM: 'stm', CountAttachment: 'attachmentCount', ClientIsArchived: 'isArchived',
  ClientArchivedReason: 'archivedReason',
};

const text = (v: string | null | undefined) => (v && v.trim() ? v : null);

export function toRow(c: Client, projectName: string | null = null, invoiceId: number | null = null): ClientRow {
  return {
    id: Number(c.no), sponsorId: c.sponsorId || null, sponsorName: text(c.sponsor), projectId: c.projectId || null, projectName,
    keperluanId: c.keperluanId || null, keperluanName: text(c.keperluan), name: c.name, noPaspor: text(c.noPaspor),
    noRptka: text(c.noRptka), permohonanHariKe3: text(c.permohonanHariKe3), epo: text(c.epo), noInvoice: text(c.noInvoice),
    keteranganTka: text(c.keteranganTka), prosesPerpanjangan: text(c.prosesPerpanjangan), status: text(c.status), sktt: text(c.sktt),
    stm: text(c.stm), isArchived: c.isArchived, archivedReason: text(c.archivedReason), invoiceId, attachmentCount: c.countAttachment,
    tanggalPermohonan: d2s(c.tanggalPermohonan), tanggalLahir: d2s(c.tanggalLahir), tanggalProsesSelesai: d2s(c.tanggalProsesSelesai),
    expiredDokumen: d2s(c.expiredDokumen), tanggalInvoice: d2s(c.tanggalInvoice), tanggalPembayaranInvoice: d2s(c.tanggalPembayaranInvoice),
    tanggalTerbitDokumen: d2s(c.tanggalTerbitDokumen), tanggalMasukLastExp: d2s(c.tanggalMasukLastExp),
  };
}

/** Snapshot log dengan key GeneXus (sama dengan log aplikasi lama). */
function gxSnapshot(c: Client) {
  const row = { ...toRow(c), pembayaranPnbp: d2s(c.pembayaranPnbp) } as Record<string, unknown>;
  return Object.fromEntries(Object.entries(GX_KEYS).map(([gx, key]) => [gx, row[key] ?? '']));
}

/** Snapshot log (key GeneXus) → field ClientRow; tanggal 0000-00-00 / 1000-01-01 = kosong. */
function fromGxSnapshot(json: string): Partial<ClientRow> | null {
  try {
    const j = JSON.parse(json) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [gx, key] of Object.entries(GX_KEYS)) {
      const v = j[gx];
      if (v === undefined || v === null || v === '' || (typeof v === 'string' && /^(0000|1000)-/.test(v))) continue;
      out[key] = v;
    }
    return out as Partial<ClientRow>;
  } catch {
    return null;
  }
}

const SORT: Record<string, (o: Prisma.SortOrder) => Prisma.ClientOrderByWithRelationInput> = {
  id: (o) => ({ no: o }),
  sponsorName: (o) => ({ sponsor: o }),
  keperluanName: (o) => ({ keperluan: o }),
};
const DIRECT_SORT = new Set(['name', 'noPaspor', 'noRptka', 'noInvoice', 'status', 'epo', 'sktt', 'stm', ...CLIENT_DATE_FIELDS]);

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  private where(q: ClientListQueryDto, archived: boolean): Prisma.ClientWhereInput {
    const and: Prisma.ClientWhereInput[] = [{ isDelete: false, isArchived: archived }];
    const s = q.search?.trim();
    if (s) {
      const ci = { contains: s };
      and.push({
        OR: [
          { name: ci }, { noPaspor: ci }, { noRptka: ci }, { noInvoice: ci }, { status: ci }, { keteranganTka: ci }, { sponsor: ci }, { keperluan: ci },
          ...(/^\d+$/.test(s) ? [{ no: BigInt(s) }] : []),
        ],
      });
    }
    if (q.sponsorId) and.push({ sponsorId: q.sponsorId });
    if (q.keperluanId) and.push({ keperluanId: q.keperluanId });
    if (q.from) and.push({ tanggalPermohonan: { gte: s2d(q.from)! } });
    if (q.to) and.push({ tanggalPermohonan: { lte: s2d(q.to)! } });
    if (q.expiring !== undefined) {
      const until = s2d(todayStr())!;
      until.setUTCDate(until.getUTCDate() + q.expiring);
      and.push({ expiredDokumen: { ...VALID_DATE, lte: until } });
    }
    if (q.uninvoiced) and.push({ tanggalProsesSelesai: VALID_DATE, OR: EMPTY_TEXT });
    if (q.unpaid) and.push({ tanggalInvoice: VALID_DATE, NOT: { tanggalPembayaranInvoice: VALID_DATE } });
    return { AND: and };
  }

  private orderBy(q: ListQueryDto): Prisma.ClientOrderByWithRelationInput[] {
    const o = q.order;
    if (q.sort && SORT[q.sort]) return [SORT[q.sort](o), { no: 'desc' }];
    if (q.sort && DIRECT_SORT.has(q.sort)) return [{ [q.sort]: o } as Prisma.ClientOrderByWithRelationInput, { no: 'desc' }];
    return [{ no: 'desc' }];
  }

  /** Nama project & id invoice (dari No Invoice) untuk sekumpulan client. */
  private async decorate(rows: Client[]): Promise<ClientRow[]> {
    const projectIds = [...new Set(rows.map((r) => r.projectId).filter((x): x is number => !!x))];
    const nos = [...new Set(rows.map((r) => r.noInvoice?.trim()).filter((x): x is string => !!x))];
    const [projects, invoices] = await Promise.all([
      projectIds.length ? this.prisma.sponsorProject.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } }) : [],
      nos.length ? this.prisma.invoice.findMany({ where: { no: { in: nos } }, select: { id: true, no: true }, orderBy: { id: 'desc' } }) : [],
    ]);
    const pName = new Map(projects.map((p) => [p.id, p.name]));
    const invId = new Map<string, number>();
    for (const i of invoices) if (i.no && !invId.has(i.no.toLowerCase())) invId.set(i.no.toLowerCase(), Number(i.id));
    return rows.map((r) => toRow(r, r.projectId ? pName.get(r.projectId) ?? null : null, r.noInvoice ? invId.get(r.noInvoice.trim().toLowerCase()) ?? null : null));
  }

  async list(q: ClientListQueryDto, archived: boolean): Promise<Paginated<ClientRow>> {
    const where = this.where(q, archived);
    const [rows, total] = await Promise.all([
      this.prisma.client.findMany({ where, orderBy: this.orderBy(q), skip: q.skip, take: q.pageSize }),
      this.prisma.client.count({ where }),
    ]);
    return paginated(await this.decorate(rows), total, q);
  }

  /** Semua baris sesuai filter (untuk export), dibatasi supaya tidak membebani server. */
  async exportRows(q: ClientListQueryDto, archived: boolean) {
    const rows = await this.prisma.client.findMany({ where: this.where(q, archived), orderBy: this.orderBy(q), take: 50_000 });
    return this.decorate(rows);
  }

  /** Client List: orang unik (nama + paspor) beserta jumlah permohonannya. */
  async people(q: ListQueryDto): Promise<Paginated<PersonRow>> {
    const s = q.search?.trim();
    const where: Prisma.ClientWhereInput = { isDelete: false, ...(s ? { OR: [{ name: { contains: s } }, { noPaspor: { contains: s } }] } : {}) };
    const order = q.order;
    const [groups, all] = await Promise.all([
      this.prisma.client.groupBy({
        by: ['name', 'noPaspor'], where, _count: { _all: true }, _max: { no: true, tanggalLahir: true },
        orderBy: q.sort === 'jumlah' ? { _count: { no: order } } : q.sort === 'noPaspor' ? { noPaspor: order } : { name: order },
        skip: q.skip, take: q.pageSize,
      }),
      this.prisma.client.groupBy({ by: ['name', 'noPaspor'], where }),
    ]);
    const data = groups.map((g) => ({
      name: g.name, noPaspor: text(g.noPaspor), tanggalLahir: d2s(g._max.tanggalLahir), jumlah: g._count._all, lastId: Number(g._max.no),
    }));
    return paginated(data, all.length, q);
  }

  private async find(id: number) {
    const c = await this.prisma.client.findFirst({ where: { no: BigInt(id), isDelete: false } });
    if (!c) throw new NotFoundException('Client tidak ditemukan.');
    return c;
  }

  async attachments(clientNo: number): Promise<ClientAttachmentRow[]> {
    // Ukuran dihitung di database supaya blob tidak ikut terbaca.
    const rows = await this.prisma.$queryRaw<{ id: bigint; name: string | null; size: bigint | number | null }[]>`
      SELECT AttachmentId AS id, AttachmentName AS name, LENGTH(AttachmentBlob) AS size FROM attachment WHERE AttachmentClientNo = ${BigInt(clientNo)} ORDER BY AttachmentId`;
    return rows.map((a) => {
      const name = attachmentName(a.name, Number(a.id));
      return { id: Number(a.id), originalName: name, mime: mimeOf(name), size: a.size === null ? null : Number(a.size), uploadedAt: null };
    });
  }

  async get(id: number): Promise<ClientDetail> {
    const c = await this.find(id);
    const [row] = await this.decorate([c]);
    const [attachments, conversations, history, first] = await Promise.all([
      this.attachments(id),
      this.prisma.conversation.findMany({ where: { tableName: 'Client', tableId: BigInt(id), isDeleted: false }, orderBy: { id: 'asc' }, include: { user: { select: { fullname: true } } } }),
      this.prisma.dataLog.findMany({ where: { tableName: 'Client', tableId: id }, orderBy: { id: 'desc' }, take: 20, select: { id: true, created: true, userId: true, tableAction: true } }),
      this.prisma.dataLog.findFirst({ where: { tableName: 'Client', tableId: id }, orderBy: { id: 'asc' }, select: { created: true } }),
    ]);
    const users = await this.userNames(history.map((h) => h.userId));
    return {
      ...row,
      pembayaranPnbp: d2s(c.pembayaranPnbp),
      createdAt: dt2s(first?.created),
      updatedAt: dt2s(history[0]?.created),
      attachments,
      conversations: conversations.map((m) => ({ id: Number(m.id), userName: m.user.fullname, message: m.text, createdAt: dt2s(m.createdAt)! })),
      history: history.map((h) => ({ id: Number(h.id), historyDate: dt2s(h.created)!, userName: users.get(h.userId) ?? null, action: h.tableAction || 'Update' })),
    };
  }

  private async userNames(ids: number[]) {
    const unique = [...new Set(ids)];
    const users = unique.length ? await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, username: true } }) : [];
    return new Map(users.map((u) => [u.id, u.username]));
  }

  /**
   * DTO → data Prisma mengikuti konvensi tabel client: teks NOT NULL = '', tanggal permohonan wajib (kosong = 1000-01-01),
   * salinan nama sponsor & keperluan diisi dari tabel master. Expired dihitung otomatis bila kosong.
   */
  private async toData(dto: ClientDto, existing?: Client) {
    const data: Record<string, unknown> = {};
    const given = (k: string) => (dto as Record<string, unknown>)[k] !== undefined;
    const NOT_NULL_TEXT = new Set(['sktt', 'stm', 'archivedReason']);
    for (const f of CLIENT_TEXT_FIELDS) {
      if (!given(f)) continue;
      const v = typeof dto[f] === 'string' ? (dto[f] as string).trim() : '';
      data[f] = v || (NOT_NULL_TEXT.has(f) ? '' : null);
    }
    for (const f of CLIENT_DATE_FIELDS) if (given(f)) data[f] = s2d(dto[f] || null);
    if (given('tanggalPermohonan') && !data.tanggalPermohonan) data.tanggalPermohonan = GX_EMPTY_DATE;
    if (given('isArchived')) data.isArchived = !!dto.isArchived;
    if (data.name === null) throw new BadRequestException('Nama Client wajib diisi.');

    if (given('sponsorId')) {
      const sp = dto.sponsorId ? await this.prisma.sponsor.findUnique({ where: { id: dto.sponsorId } }) : null;
      if (dto.sponsorId && !sp) throw new BadRequestException('Sponsor tidak ditemukan.');
      data.sponsorId = sp?.id ?? 0;
      data.sponsor = sp?.name ?? '';
    }
    if (given('keperluanId')) {
      const kp = dto.keperluanId ? await this.prisma.keperluan.findUnique({ where: { id: dto.keperluanId } }) : null;
      if (dto.keperluanId && !kp) throw new BadRequestException('Keperluan tidak ditemukan.');
      data.keperluanId = kp?.id ?? 0;
      data.keperluan = kp?.name ?? null;
    }
    if (given('projectId')) data.projectId = dto.projectId || null;

    // Nilai akhir (gabungan data lama + perubahan) untuk validasi project & Expired Dokumen otomatis.
    const merged = { ...(existing ? toRow(existing) : {}), ...Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined).map(([k, v]) => [k, v === '' ? null : v])) } as Record<string, any>;
    if (!merged.expiredDokumen && merged.keperluanId) {
      const k = await this.prisma.keperluan.findUnique({ where: { id: merged.keperluanId } });
      const auto = k && computeExpired(merged, { periode: k.periode ?? 0, periodeIn: k.periodeIn?.trim() || 'MONTHS', sumberData: k.sumberData?.trim() || 'TANGGAL TERBIT DOKUMEN' });
      if (auto) data.expiredDokumen = s2d(auto);
    }
    if (merged.projectId && merged.sponsorId) {
      const p = await this.prisma.sponsorProject.findUnique({ where: { id: merged.projectId } });
      if (!p) throw new BadRequestException('Project tidak ditemukan.');
      if (p.sponsorId !== merged.sponsorId) throw new BadRequestException('Project tidak sesuai dengan Sponsor yang dipilih.');
    }
    return data;
  }

  /** Catat ke datalog (TableName 'Client') dengan snapshot data client — dipakai juga modul Invoice. */
  async log(userId: number, clientNo: number, action: string) {
    const c = await this.prisma.client.findUnique({ where: { no: BigInt(clientNo) } });
    await this.prisma.dataLog.create({
      data: {
        tableName: 'Client', tableId: clientNo, userId, created: new Date(), tableAction: action,
        description: c ? JSON.stringify(gxSnapshot(c)).slice(0, 5000) : '',
      },
    });
  }

  async create(dto: ClientDto, userId: number) {
    const data = await this.toData({ sponsorId: null, keperluanId: null, ...dto } as ClientDto);
    const c = await this.prisma.client.create({
      data: { sponsor: '', sponsorId: 0, keperluanId: 0, companyId: 0, tanggalPermohonan: GX_EMPTY_DATE, ...data } as Prisma.ClientUncheckedCreateInput,
    });
    await this.log(userId, Number(c.no), 'Insert');
    return this.get(Number(c.no));
  }

  async update(id: number, dto: ClientDto, userId: number) {
    const existing = await this.find(id);
    const data = await this.toData(dto, existing);
    await this.prisma.client.update({ where: { no: BigInt(id) }, data: data as Prisma.ClientUncheckedUpdateInput });
    await this.log(userId, id, 'Update');
    return this.get(id);
  }

  /** Hapus lunak (ClientIsDelete), seperti aplikasi lama. */
  async remove(id: number, userId: number) {
    const c = await this.find(id);
    if (c.noInvoice?.trim()) throw new BadRequestException('Client sudah masuk invoice. Hapus/ubah invoice-nya terlebih dahulu.');
    await this.prisma.client.update({ where: { no: BigInt(id) }, data: { isDelete: true } });
    await this.log(userId, id, 'Delete');
  }

  async archive(id: number, archive: boolean, reason: string | undefined, userId: number) {
    await this.find(id);
    await this.prisma.client.update({ where: { no: BigInt(id) }, data: { isArchived: archive, archivedReason: archive ? (reason?.trim() ?? '').slice(0, 100) : '' } });
    await this.log(userId, id, archive ? 'Archive' : 'Unarchive');
  }

  async addConversation(clientNo: number, message: string, userId: number) {
    await this.find(clientNo);
    const m = await this.prisma.conversation.create({
      data: { tableName: 'Client', tableId: BigInt(clientNo), createdAt: new Date(), text: message.trim().slice(0, 1000), userId, mentionIdJson: 0, isDeleted: false },
      include: { user: { select: { fullname: true } } },
    });
    return { id: Number(m.id), userName: m.user.fullname, message: m.text, createdAt: dt2s(m.createdAt)! };
  }

  /** Lampiran disimpan sebagai blob di tabel attachment; CountAttachment ikut diperbarui. */
  async addAttachments(clientNo: number, files: Express.Multer.File[], userId: number) {
    await this.find(clientNo);
    if (!files?.length) throw new BadRequestException('Tidak ada file yang diunggah.');
    await this.prisma.$transaction(async (tx) => {
      for (const f of files) {
        await tx.attachment.create({
          data: { clientNo: BigInt(clientNo), blob: new Uint8Array(f.buffer), name: Buffer.from(f.originalname, 'latin1').toString('utf8').slice(0, 255), url: null, status: null },
        });
      }
      await tx.client.update({ where: { no: BigInt(clientNo) }, data: { countAttachment: await tx.attachment.count({ where: { clientNo: BigInt(clientNo) } }) } });
    });
    await this.log(userId, clientNo, 'Attachment');
    return this.attachments(clientNo);
  }

  async attachment(aid: number) {
    const a = await this.prisma.attachment.findUnique({ where: { id: BigInt(aid) } });
    if (!a) throw new NotFoundException('Lampiran tidak ditemukan.');
    if (!a.blob.length) throw new NotFoundException('Isi file lampiran tidak tersedia (belum disalin ke database ini).');
    const name = attachmentName(a.name, aid);
    return { name, mime: mimeOf(name, a.blob), data: Buffer.from(a.blob) };
  }

  async removeAttachment(aid: number, userId: number) {
    const a = await this.prisma.attachment.findUnique({ where: { id: BigInt(aid) }, select: { id: true, clientNo: true } });
    if (!a) throw new NotFoundException('Lampiran tidak ditemukan.');
    const linked = await this.prisma.invoiceAttachment.count({ where: { attachmentRefId: a.id } });
    if (linked) throw new BadRequestException(`Lampiran ini dipakai di ${linked} lampiran invoice. Hapus dari invoice terlebih dahulu.`);
    await this.prisma.$transaction(async (tx) => {
      await tx.attachment.delete({ where: { id: a.id } });
      await tx.client.update({ where: { no: a.clientNo }, data: { countAttachment: await tx.attachment.count({ where: { clientNo: a.clientNo } }) } });
    });
    await this.log(userId, Number(a.clientNo), 'AttachmentDelete');
  }

  async logs(q: ListQueryDto): Promise<Paginated<ClientLogRow>> {
    const s = q.search?.trim();
    const and: Prisma.DataLogWhereInput[] = [{ tableName: 'Client' }];
    if (s) {
      const users = await this.prisma.user.findMany({ where: { OR: [{ username: { contains: s } }, { fullname: { contains: s } }] }, select: { id: true } });
      and.push({
        OR: [
          { tableAction: { contains: s } },
          { description: { contains: s } },
          ...(users.length ? [{ userId: { in: users.map((u) => u.id) } }] : []),
          ...(/^\d+$/.test(s) ? [{ tableId: Number(s) }] : []),
        ],
      });
    }
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.dataLog.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.pageSize }),
      this.prisma.dataLog.count({ where }),
    ]);
    const users = await this.userNames(rows.map((r) => r.userId));
    return paginated(rows.map((r) => ({
      id: Number(r.id), historyDate: dt2s(r.created)!, userName: users.get(r.userId) ?? null, clientId: r.tableId, action: r.tableAction || 'Update',
      snapshot: fromGxSnapshot(r.description),
    })), total, q);
  }
}

/** Nama file lampiran; data lama sering berisi '0' / kosong. */
export function attachmentName(name: string | null, id: number) {
  const n = name?.trim();
  return n && n !== '0' ? n : `lampiran-${id}.pdf`;
}

const INLINE_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png']);

/** Content-Disposition lampiran: PDF/gambar dibuka langsung di browser (inline), lainnya atau `download` → diunduh. */
export function fileDisposition(name: string, mime: string, download = false) {
  const type = !download && INLINE_MIME.has(mime) ? 'inline' : 'attachment';
  return `${type}; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export function mimeOf(name: string, data?: Uint8Array) {
  if (data?.length) {
    if (data[0] === 0x25 && data[1] === 0x50) return 'application/pdf';
    if (data[0] === 0xff && data[1] === 0xd8) return 'image/jpeg';
    if (data[0] === 0x89 && data[1] === 0x50) return 'image/png';
  }
  const ext = name.toLowerCase().split('.').pop();
  return ({ pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' } as Record<string, string>)[ext ?? ''] ?? 'application/octet-stream';
}
