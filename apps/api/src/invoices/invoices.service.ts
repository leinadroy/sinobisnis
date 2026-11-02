import fs from 'node:fs';
import path from 'node:path';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  canEdit, computeInvoiceTotals, formatInvoiceNo, terbilang, todayStr,
  type CreateInvoiceResult, type InvoiceableClientRow, type InvoiceDetail, type InvoiceList, type InvoicePrintData, type InvoiceRow,
  type Paginated, type UpdateRequestRow,
} from '@sml/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ClientsService, UPLOAD_DIR } from '../clients/clients.service.js';
import { d2s, s2d } from '../common/dates.js';
import { paginated } from '../common/list-query.dto.js';
import { KontrakService } from '../kontrak/kontrak.service.js';
import type { CreateInvoiceDto, InvoiceableQueryDto, InvoiceListQueryDto, RequestListQueryDto, SaveInvoiceDto } from './invoices.dto.js';

const include = {
  company: { select: { name: true } },
  sponsor: { select: { name: true } },
  billTo: { select: { companyName: true } },
  bankAccount: { select: { bankName: true, accountNo: true } },
  updateRequests: { orderBy: { id: 'desc' }, take: 1, select: { status: true } },
  _count: { select: { clients: true } },
} satisfies Prisma.InvoiceInclude;
type InvoiceWithRel = Prisma.InvoiceGetPayload<{ include: typeof include }>;

const detailInclude = {
  ...include,
  groups: {
    orderBy: [{ seq: 'asc' }, { id: 'asc' }],
    include: {
      items: { orderBy: [{ seq: 'asc' }, { id: 'asc' }] },
      clients: { orderBy: { seq: 'asc' }, include: { client: { select: { id: true, name: true, noPaspor: true } } } },
    },
  },
  taxes: { orderBy: { id: 'asc' } },
  attachments: { orderBy: { id: 'asc' } },
} satisfies Prisma.InvoiceInclude;

function toRow(i: InvoiceWithRel): InvoiceRow {
  return {
    id: i.id, no: i.no, date: d2s(i.date), paidDate: d2s(i.paidDate), status: i.status,
    companyId: i.companyId, companyName: i.company?.name ?? null, sponsorId: i.sponsorId, sponsorName: i.sponsor?.name ?? null,
    billToId: i.billToId, billToName: i.billTo?.companyName ?? null, npwp: i.npwp,
    subTotal: i.subTotal.toNumber(), total: i.total.toNumber(), information: i.information,
    bankAccountLabel: i.bankAccount ? `${i.bankAccount.bankName} _ ${i.bankAccount.accountNo ?? ''}` : null,
    requestStatus: i.updateRequests[0]?.status ?? null, clientCount: i._count.clients, createdBy: i.createdBy,
  };
}

const isEditable = (i: { status: string; updateRequests: { status: string }[] }) =>
  i.status === 'DRAFT' || i.updateRequests[0]?.status === 'APPROVED';

const toRequestRow = (r: Prisma.UpdateRequestGetPayload<{ include: { invoice: { select: { no: true } } } }>): UpdateRequestRow => ({
  id: r.id, invoiceId: r.invoiceId, invoiceNo: r.invoice.no, status: r.status, reason: r.reason, requestedBy: r.requestedBy,
  decidedBy: r.decidedBy, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt?.toISOString() ?? null,
});

const SORT: Record<string, (o: Prisma.SortOrder) => Prisma.InvoiceOrderByWithRelationInput> = {
  sponsorName: (o) => ({ sponsor: { name: o } }),
  billToName: (o) => ({ billTo: { companyName: o } }),
  companyName: (o) => ({ company: { name: o } }),
};
const DIRECT_SORT = new Set(['id', 'no', 'date', 'paidDate', 'status', 'total', 'subTotal']);

/** Client belum ber-invoice: tidak terhubung ke invoice dan kolom No Invoice kosong. */
const NOT_INVOICED: Prisma.ClientWhereInput = { invoiceId: null, OR: [{ noInvoice: null }, { noInvoice: '' }] };

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ClientsService,
    private readonly kontrak: KontrakService,
  ) {}

  // ───────────── List ─────────────

  private where(q: InvoiceListQueryDto): Prisma.InvoiceWhereInput {
    const and: Prisma.InvoiceWhereInput[] = [];
    const s = q.search?.trim();
    if (s) {
      const ci = { contains: s, mode: 'insensitive' as const };
      and.push({
        OR: [
          { no: ci }, { information: ci }, { npwp: ci }, { sponsor: { name: ci } }, { billTo: { companyName: ci } }, { company: { name: ci } },
          { clients: { some: { OR: [{ name: ci }, { noPaspor: ci }] } } },
          ...(/^\d+$/.test(s) ? [{ id: Number(s) }] : []),
        ],
      });
    }
    if (q.status) and.push({ status: q.status });
    if (q.from) and.push({ date: { gte: s2d(q.from)! } });
    if (q.to) and.push({ date: { lte: s2d(q.to)! } });
    if (q.sponsorId) and.push({ sponsorId: q.sponsorId });
    if (q.billToId) and.push({ billToId: q.billToId });
    return { AND: and };
  }

  private orderBy(q: InvoiceListQueryDto): Prisma.InvoiceOrderByWithRelationInput[] {
    if (q.sort && SORT[q.sort]) return [SORT[q.sort](q.order), { id: 'desc' }];
    if (q.sort && DIRECT_SORT.has(q.sort)) return [{ [q.sort]: { sort: q.order, nulls: 'last' } } as Prisma.InvoiceOrderByWithRelationInput, { id: 'desc' }];
    return [{ id: 'desc' }];
  }

  async list(q: InvoiceListQueryDto): Promise<InvoiceList> {
    const where = this.where(q);
    const [rows, total, sum] = await Promise.all([
      this.prisma.invoice.findMany({ where, include, orderBy: this.orderBy(q), skip: q.skip, take: q.pageSize }),
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.aggregate({ where, _sum: { total: true } }),
    ]);
    return { ...paginated(rows.map(toRow), total, q), amount: sum._sum.total?.toNumber() ?? 0 };
  }

  async exportRows(q: InvoiceListQueryDto) {
    const rows = await this.prisma.invoice.findMany({ where: this.where(q), include, orderBy: this.orderBy(q), take: 50_000 });
    return rows.map((r) => ({ ...toRow(r), totalTerbilang: r.totalTerbilang }));
  }

  // ───────────── Detail ─────────────

  async get(id: number): Promise<InvoiceDetail> {
    const i = await this.prisma.invoice.findUnique({ where: { id }, include: detailInclude });
    if (!i) throw new NotFoundException('Invoice tidak ditemukan.');
    const requests = await this.prisma.updateRequest.findMany({ where: { invoiceId: id }, orderBy: { id: 'desc' }, include: { invoice: { select: { no: true } } } });
    return {
      ...toRow(i),
      bankAccountId: i.bankAccountId,
      totalTerbilang: i.totalTerbilang,
      createdAt: i.createdAt.toISOString(),
      groups: i.groups.map((g) => ({
        id: g.id,
        clients: g.clients.map((c) => c.client),
        items: g.items.map((it) => ({
          id: it.id, description: it.description, keperluanId: it.keperluanId, qty: it.qty.toNumber(), unitPrice: it.unitPrice.toNumber(), subTotal: it.subTotal.toNumber(),
        })),
      })),
      taxes: i.taxes.map((t) => ({ id: t.id, taxId: t.taxId, description: t.description, value: t.value.toNumber() })),
      attachments: i.attachments.map((a) => ({ id: a.id, originalName: a.originalName, mime: a.mime, size: a.size, uploadedAt: a.uploadedAt.toISOString() })),
      requests: requests.map(toRequestRow),
      editable: isEditable(i),
    };
  }

  /** Data cetak: detail + Company (penanda tangan), Bill To (alamat), dan rekening. */
  async printData(id: number): Promise<InvoicePrintData> {
    const invoice = await this.get(id);
    const [company, billTo, bank, signCfg] = await Promise.all([
      invoice.companyId ? this.prisma.company.findUnique({ where: { id: invoice.companyId } }) : null,
      invoice.billToId ? this.prisma.billTo.findUnique({ where: { id: invoice.billToId } }) : null,
      invoice.bankAccountId ? this.prisma.bankAccount.findUnique({ where: { id: invoice.bankAccountId } }) : null,
      this.prisma.systemConfig.findUnique({ where: { key: 'DISETUJUI_OLEH' } }),
    ]);
    return {
      invoice,
      company: company && {
        name: company.name, address: company.address, signedBy: company.signedBy || signCfg?.value || null, signedTitle: company.signedTitle,
      },
      billTo: billTo && {
        companyName: billTo.companyName, npwp: billTo.npwp,
        address: [billTo.alamat1, billTo.alamat2, billTo.alamat3, billTo.alamat4].filter((a): a is string => !!a),
      },
      bank: bank && {
        bankName: bank.bankName, branch: bank.branch, address: bank.address, swiftcode: bank.swiftcode, accountFor: bank.accountFor || company?.name || null, accountNo: bank.accountNo,
      },
    };
  }

  // ───────────── Create Invoice ─────────────

  /** Client yang bisa di-invoice (belum punya invoice, tidak diarsip). Maks 500 baris. */
  async invoiceable(q: InvoiceableQueryDto): Promise<InvoiceableClientRow[]> {
    const and: Prisma.ClientWhereInput[] = [{ isArchived: false }, NOT_INVOICED];
    if (q.sponsorId) and.push({ sponsorId: q.sponsorId });
    if (q.projectId) and.push({ projectId: q.projectId });
    if (q.billToId) and.push({ project: { billToId: q.billToId } });
    const s = q.search?.trim();
    if (s) and.push({ OR: [{ name: { contains: s, mode: 'insensitive' } }, { noPaspor: { contains: s, mode: 'insensitive' } }] });
    const rows = await this.prisma.client.findMany({
      where: { AND: and },
      include: { sponsor: { select: { name: true } }, project: { select: { name: true, billToId: true } }, keperluan: { select: { name: true } } },
      orderBy: { id: 'desc' },
      take: 500,
    });
    return rows.map((c) => ({
      id: c.id, name: c.name, noPaspor: c.noPaspor, sponsorId: c.sponsorId, sponsorName: c.sponsor?.name ?? null,
      projectName: c.project?.name ?? null, keperluanName: c.keperluan?.name ?? null, billToId: c.project?.billToId ?? null,
      tanggalPermohonan: d2s(c.tanggalPermohonan), tanggalProsesSelesai: d2s(c.tanggalProsesSelesai),
    }));
  }

  priceList(billToId: number, date?: string) {
    return this.kontrak.priceList(billToId, date ?? todayStr());
  }

  /**
   * Buat invoice DRAFT dari client terpilih: nomor otomatis dari format Company, satu grup per Keperluan
   * dengan harga dari Kontrak Bill To (atau harga default Keperluan bila tidak ada di kontrak).
   */
  async create(dto: CreateInvoiceDto, user: AuthUser): Promise<CreateInvoiceResult> {
    const ids = [...new Set(dto.clientIds)];
    const company = await this.prisma.company.findUnique({ where: { id: dto.companyId } });
    if (!company) throw new BadRequestException('Company tidak ditemukan.');
    const clients = await this.prisma.client.findMany({
      where: { id: { in: ids } },
      include: { keperluan: { select: { name: true, harga: true } }, project: { select: { billToId: true } } },
      orderBy: { id: 'asc' },
    });
    if (clients.length !== ids.length) throw new BadRequestException('Sebagian client tidak ditemukan.');
    const taken = clients.filter((c) => c.invoiceId || c.noInvoice?.trim());
    if (taken.length) throw new BadRequestException(`Client sudah punya invoice: ${taken.slice(0, 5).map((c) => c.name).join(', ')}${taken.length > 5 ? ', …' : ''}.`);

    const date = todayStr();
    const billToId = dto.billToId || clients.find((c) => c.project?.billToId)?.project?.billToId || null;
    const billTo = billToId ? await this.prisma.billTo.findUnique({ where: { id: billToId } }) : null;
    if (billToId && !billTo) throw new BadRequestException('Bill To tidak ditemukan.');
    const prices = await this.kontrak.priceList(billToId, date);
    const info = company.invoiceInformation
      || (await this.prisma.systemConfig.findUnique({ where: { key: 'DEFAULT_ADDITIONAL_INFORMATION' } }))?.value
      || null;

    // Satu grup per keperluan; item pertama = layanan keperluan tsb dengan pax = jumlah client.
    const groups = new Map<number, typeof clients>();
    for (const c of clients) {
      const key = c.keperluanId ?? 0;
      groups.set(key, [...(groups.get(key) ?? []), c]);
    }
    let missingPrice = 0;
    const plan = [...groups.entries()].map(([kid, members]) => {
      const k = kid ? prices.find((p) => p.keperluanId === kid) : undefined;
      const price = k ? k.price : (members[0].keperluan?.harga.toNumber() ?? 0);
      if (!price) missingPrice++;
      return { kid: kid || null, members, description: k?.description ?? members[0].keperluan?.name ?? 'Jasa', price };
    });
    const { subTotal, total } = computeInvoiceTotals(plan.map((p) => ({ items: [{ qty: p.members.length, unitPrice: p.price }] })), [], []);

    const inv = await this.prisma.$transaction(async (tx) => {
      // increment atomik: dua Create Invoice bersamaan tidak mendapat nomor yang sama.
      const co = await tx.company.update({ where: { id: company.id }, data: { lastNo: { increment: 1 } } });
      const no = formatInvoiceNo(co.noFormat, co.lastNo, date);
      const created = await tx.invoice.create({
        data: {
          no, companyId: company.id, sponsorId: clients[0].sponsorId, billToId, npwp: billTo?.npwp ?? null, date: s2d(date), status: 'DRAFT',
          information: info, bankAccountId: company.bankAccountId, createdBy: user.username, subTotal, total, totalTerbilang: terbilang(total),
        },
      });
      for (const [gi, p] of plan.entries()) {
        await tx.invoiceGroup.create({
          data: {
            invoiceId: created.id, seq: gi + 1,
            clients: { create: p.members.map((c, ci) => ({ clientId: c.id, seq: ci + 1 })) },
            items: { create: [{ invoiceId: created.id, seq: 1, description: p.description, keperluanId: p.kid, qty: p.members.length, unitPrice: p.price, subTotal: p.members.length * p.price }] },
          },
        });
      }
      // Syarat "belum ber-invoice" diulang di sini supaya client yang baru saja di-invoice user lain tidak tertimpa.
      const linked = await tx.client.updateMany({
        where: { id: { in: ids }, ...NOT_INVOICED },
        data: { noInvoice: no, tanggalInvoice: s2d(date), invoiceId: created.id },
      });
      if (linked.count !== ids.length) throw new ConflictException('Sebagian client baru saja dimasukkan ke invoice lain. Muat ulang daftar client.');
      return created;
    }).catch((e) => { throw this.mapError(e); });

    for (const id of ids) await this.clients.log(user.username, id, 'INVOICE');
    return { id: inv.id, no: inv.no, missingPrice };
  }

  // ───────────── Simpan ─────────────

  async save(id: number, dto: SaveInvoiceDto, user: AuthUser): Promise<InvoiceDetail> {
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      include: { updateRequests: { orderBy: { id: 'desc' }, take: 1, select: { status: true } }, clients: { select: { id: true } } },
    });
    if (!inv) throw new NotFoundException('Invoice tidak ditemukan.');
    if (!isEditable(inv)) throw new ForbiddenException(`Invoice sudah ${inv.status} dan terkunci. Ajukan "Request To Edit" terlebih dahulu.`);

    // Buang item kosong dan grup yang tidak berisi item maupun client.
    const groups = dto.groups
      .map((g) => ({
        clientIds: g.clientIds,
        items: g.items
          .filter((it) => it.description.trim() || Number(it.unitPrice))
          .map((it) => ({ ...it, description: it.description.trim() })),
      }))
      .filter((g) => g.items.length || g.clientIds.length);
    if (groups.some((g) => g.items.some((it) => !it.description))) throw new BadRequestException('Description item wajib diisi.');

    const clientIds = groups.flatMap((g) => g.clientIds);
    const unique = new Set(clientIds);
    if (unique.size !== clientIds.length) throw new BadRequestException('Satu client tidak boleh tercantum di lebih dari satu grup.');
    if (unique.size) {
      const found = await this.prisma.client.findMany({ where: { id: { in: [...unique] } }, select: { id: true, name: true, invoiceId: true, noInvoice: true } });
      if (found.length !== unique.size) throw new BadRequestException('Sebagian client tidak ditemukan.');
      const taken = found.filter((c) => (c.invoiceId && c.invoiceId !== id) || (!c.invoiceId && c.noInvoice?.trim()));
      if (taken.length) throw new BadRequestException(`Client sudah punya invoice lain: ${taken.slice(0, 5).map((c) => c.name).join(', ')}.`);
    }

    const no = dto.no?.trim() || inv.no;
    const date = dto.date || null;
    if (dto.status !== 'DRAFT') {
      const missing = [!no && 'Invoice No', !date && 'Invoice Date', !dto.companyId && 'Company', !dto.billToId && 'Bill To'].filter(Boolean);
      if (missing.length) throw new BadRequestException(`Invoice ${dto.status} wajib punya ${missing.join(', ')}.`);
      if (!groups.some((g) => g.items.length)) throw new BadRequestException(`Invoice ${dto.status} minimal berisi satu item.`);
    }
    const paidDate = dto.status === 'PAID' ? dto.paidDate || todayStr() : null;

    const master = (await this.prisma.tax.findMany()).map((t) => ({ id: t.id, name: t.name, percentage: t.percentage.toNumber(), type: t.type }));
    const taxes = dto.taxes
      .map((t) => ({ ...t, taxId: t.taxId || null, description: t.description.trim() }))
      .filter((t) => t.taxId || t.description || Number(t.value));
    if (taxes.some((t) => t.taxId && !master.some((m) => m.id === t.taxId))) throw new BadRequestException('Pajak tidak ditemukan.');
    const totals = computeInvoiceTotals(groups, taxes, master);

    const before = new Set(inv.clients.map((c) => c.id));
    const removed = [...before].filter((c) => !unique.has(c));
    const added = [...unique].filter((c) => !before.has(c));
    const linkChanged = no !== inv.no || date !== d2s(inv.date) || paidDate !== d2s(inv.paidDate);

    await this.prisma.$transaction(async (tx) => {
      await tx.invoiceGroup.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceTax.deleteMany({ where: { invoiceId: id } });
      for (const [gi, g] of groups.entries()) {
        await tx.invoiceGroup.create({
          data: {
            invoiceId: id, seq: gi + 1,
            clients: { create: g.clientIds.map((clientId, ci) => ({ clientId, seq: ci + 1 })) },
            items: {
              create: g.items.map((it, ii) => ({
                invoiceId: id, seq: ii + 1, description: it.description, keperluanId: it.keperluanId || null, qty: it.qty, unitPrice: it.unitPrice,
                subTotal: Math.round(it.qty * it.unitPrice * 100) / 100,
              })),
            },
          },
        });
      }
      if (taxes.length) {
        await tx.invoiceTax.createMany({
          data: taxes.map((t, i) => ({
            invoiceId: id, taxId: t.taxId, value: totals.taxValues[i],
            description: t.description || master.find((m) => m.id === t.taxId)?.name || 'Other',
          })),
        });
      }
      await tx.invoice.update({
        where: { id },
        data: {
          no, companyId: dto.companyId || null, sponsorId: dto.sponsorId || null, billToId: dto.billToId || null, npwp: dto.npwp?.trim() || null,
          date: s2d(date), paidDate: s2d(paidDate), status: dto.status, information: dto.information?.trim() || null, bankAccountId: dto.bankAccountId || null,
          subTotal: totals.subTotal, total: totals.total, totalTerbilang: terbilang(totals.total),
        },
      });
      // Kolom invoice di data client mengikuti invoice ini.
      if (removed.length) {
        await tx.client.updateMany({
          where: { id: { in: removed }, invoiceId: id },
          data: { noInvoice: null, tanggalInvoice: null, tanggalPembayaranInvoice: null, invoiceId: null },
        });
      }
      if (unique.size) {
        const linked = await tx.client.updateMany({
          where: { id: { in: [...unique] }, OR: [{ invoiceId: id }, NOT_INVOICED] },
          data: { noInvoice: no, tanggalInvoice: s2d(date), tanggalPembayaranInvoice: s2d(paidDate), invoiceId: id },
        });
        if (linked.count !== unique.size) throw new ConflictException('Sebagian client baru saja dimasukkan ke invoice lain. Muat ulang halaman.');
      }
      // Izin edit hanya berlaku untuk satu kali simpan.
      await tx.updateRequest.updateMany({ where: { invoiceId: id, status: 'APPROVED' }, data: { status: 'DONE', updatedAt: new Date() } });
    }).catch((e) => { throw this.mapError(e); });

    for (const c of removed) await this.clients.log(user.username, c, 'INVOICE_REMOVE');
    for (const c of added) await this.clients.log(user.username, c, 'INVOICE');
    if (linkChanged) for (const c of [...unique].filter((x) => before.has(x))) await this.clients.log(user.username, c, 'INVOICE_UPDATE');
    return this.get(id);
  }

  /** Hapus invoice: DRAFT oleh pemegang hak edit Invoice; FINAL/PAID hanya oleh yang berhak memutuskan Update Request. */
  async remove(id: number, user: AuthUser) {
    const inv = await this.prisma.invoice.findUnique({ where: { id }, include: { clients: { select: { id: true } }, attachments: true } });
    if (!inv) throw new NotFoundException('Invoice tidak ditemukan.');
    if (inv.status !== 'DRAFT' && !canEdit(user.access, 'invoices.requests')) {
      throw new ForbiddenException('Hanya invoice DRAFT yang bisa dihapus.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.client.updateMany({
        where: { invoiceId: id },
        data: { noInvoice: null, tanggalInvoice: null, tanggalPembayaranInvoice: null, invoiceId: null },
      });
      await tx.invoice.delete({ where: { id } });
    });
    inv.attachments.forEach((a) => fs.rm(path.join(UPLOAD_DIR, a.storedName), () => {}));
    for (const c of inv.clients) await this.clients.log(user.username, c.id, 'INVOICE_REMOVE');
  }

  // ───────────── Lampiran ─────────────

  private async ensureEditable(id: number) {
    const inv = await this.prisma.invoice.findUnique({ where: { id }, include: { updateRequests: { orderBy: { id: 'desc' }, take: 1, select: { status: true } } } });
    if (!inv) throw new NotFoundException('Invoice tidak ditemukan.');
    if (!isEditable(inv)) throw new ForbiddenException(`Invoice sudah ${inv.status} dan terkunci. Ajukan "Request To Edit" terlebih dahulu.`);
  }

  async addAttachments(id: number, files: Express.Multer.File[]) {
    const cleanup = () => files?.forEach((f) => fs.rm(f.path, () => {}));
    try {
      await this.ensureEditable(id);
    } catch (e) {
      cleanup();
      throw e;
    }
    if (!files?.length) throw new BadRequestException('Tidak ada file yang diunggah.');
    await this.prisma.invoiceAttachment.createMany({
      data: files.map((f) => ({ invoiceId: id, originalName: Buffer.from(f.originalname, 'latin1').toString('utf8'), storedName: f.filename, mime: f.mimetype, size: f.size })),
    });
    return (await this.get(id)).attachments;
  }

  async attachment(aid: number) {
    const a = await this.prisma.invoiceAttachment.findUnique({ where: { id: aid } });
    if (!a) throw new NotFoundException('Lampiran tidak ditemukan.');
    const file = path.join(UPLOAD_DIR, a.storedName);
    if (!fs.existsSync(file)) throw new NotFoundException('File lampiran tidak ada di penyimpanan.');
    return { ...a, file };
  }

  async removeAttachment(aid: number) {
    const a = await this.prisma.invoiceAttachment.findUnique({ where: { id: aid } });
    if (!a) throw new NotFoundException('Lampiran tidak ditemukan.');
    await this.ensureEditable(a.invoiceId);
    await this.prisma.invoiceAttachment.delete({ where: { id: aid } });
    fs.rm(path.join(UPLOAD_DIR, a.storedName), () => {});
  }

  // ───────────── Update Request ─────────────

  async requestEdit(id: number, reason: string, user: AuthUser) {
    const inv = await this.prisma.invoice.findUnique({ where: { id }, select: { status: true } });
    if (!inv) throw new NotFoundException('Invoice tidak ditemukan.');
    if (inv.status === 'DRAFT') throw new BadRequestException('Invoice DRAFT bisa langsung diubah tanpa request.');
    const open = await this.prisma.updateRequest.count({ where: { invoiceId: id, status: { in: ['PENDING', 'APPROVED'] } } });
    if (open) throw new BadRequestException('Masih ada request edit yang menunggu persetujuan / belum dipakai.');
    await this.prisma.updateRequest.create({ data: { invoiceId: id, reason: reason.trim(), requestedBy: user.username } });
    return this.get(id);
  }

  async cancelRequest(id: number) {
    const res = await this.prisma.updateRequest.updateMany({
      where: { invoiceId: id, status: { in: ['PENDING', 'APPROVED'] } },
      data: { status: 'CANCELLED', updatedAt: new Date() },
    });
    if (!res.count) throw new BadRequestException('Tidak ada request edit yang bisa dibatalkan.');
    return this.get(id);
  }

  async requests(q: RequestListQueryDto): Promise<Paginated<UpdateRequestRow>> {
    const and: Prisma.UpdateRequestWhereInput[] = [];
    if (q.status) and.push({ status: q.status });
    const s = q.search?.trim();
    if (s) {
      const ci = { contains: s, mode: 'insensitive' as const };
      and.push({ OR: [{ invoice: { no: ci } }, { requestedBy: ci }, { decidedBy: ci }, { reason: ci }] });
    }
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.updateRequest.findMany({ where, include: { invoice: { select: { no: true } } }, orderBy: { id: 'desc' }, skip: q.skip, take: q.pageSize }),
      this.prisma.updateRequest.count({ where }),
    ]);
    return paginated(rows.map(toRequestRow), total, q);
  }

  /** Setujui / tolak request PENDING. Peminta tidak boleh memutuskan request-nya sendiri (kecuali role Developer). */
  async decide(rid: number, approve: boolean, user: AuthUser) {
    const r = await this.prisma.updateRequest.findUnique({ where: { id: rid } });
    if (!r) throw new NotFoundException('Request tidak ditemukan.');
    if (r.status !== 'PENDING') throw new BadRequestException(`Request sudah ${r.status}.`);
    if (r.requestedBy === user.username && !user.isSuperRole) throw new ForbiddenException('Request sendiri harus diputuskan oleh user lain.');
    const res = await this.prisma.updateRequest.updateMany({
      where: { id: rid, status: 'PENDING' },
      data: { status: approve ? 'APPROVED' : 'REJECTED', decidedBy: user.username, updatedAt: new Date() },
    });
    if (!res.count) throw new BadRequestException('Request sudah diputuskan user lain.');
  }

  private mapError(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return new ConflictException('Nomor invoice sudah dipakai invoice lain. Periksa No Invoice / Last No di Company.');
      if (e.code === 'P2003') return new BadRequestException('Company, Sponsor, Bill To, Bank Account, atau Keperluan tidak ditemukan.');
      if (e.code === 'P2025') return new NotFoundException('Data tidak ditemukan.');
    }
    return e;
  }
}
