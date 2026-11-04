import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  canEdit, computeInvoiceTotals, formatInvoiceNo, terbilangEn, todayStr,
  type CreateInvoiceResult, type InvoiceableClientRow, type InvoiceAttachmentRow, type InvoiceDetail, type InvoiceList, type InvoicePrintData,
  type InvoiceRow, type InvoiceStatus, type Paginated, type RequestStatus, type UpdateRequestRow,
} from '@sml/shared';
import { Prisma, type Invoice } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { attachmentName, ClientsService, mimeOf } from '../clients/clients.service.js';
import { d2s, GX_EMPTY_DATE, s2d } from '../common/dates.js';
import { paginated } from '../common/list-query.dto.js';
import { KontrakService } from '../kontrak/kontrak.service.js';
import { matchBillTo } from '../master/master.service.js';
import { groupsToRows, normName, rowsToGroups, type Group } from './invoice-rows.js';
import type { CreateInvoiceDto, InvoiceableQueryDto, InvoiceListQueryDto, RequestListQueryDto, SaveInvoiceDto } from './invoices.dto.js';

/** Client belum ber-invoice: tidak dihapus/diarsip dan No Invoice kosong. */
const INVOICEABLE: Prisma.ClientWhereInput = { isDelete: false, isArchived: false, OR: [{ noInvoice: null }, { noInvoice: '' }] };

/** InvoiceEditStatus / UpdateRequestStatus lama memakai CANCELED. */
const toRequestStatus = (s: string | null | undefined): RequestStatus | null => {
  const v = (s ?? '').trim().toUpperCase();
  if (!v) return null;
  return v === 'CANCELED' ? 'CANCELLED' : (v as RequestStatus);
};
const toStatus = (s: string | null): InvoiceStatus => (s === 'FINAL' || s === 'PAID' ? s : 'DRAFT');
const isEditable = (i: Pick<Invoice, 'status' | 'editStatus'>) => toStatus(i.status) === 'DRAFT' || (i.editStatus ?? '').toUpperCase() === 'APPROVED';
/** Terbilang tersimpan dengan format cetakan lama: "#Indonesia Rupiah One Million …#". */
const terbilangLegacy = (n: number) => `#Indonesia Rupiah ${n < 0 ? 'Minus ' : ''}${terbilangEn(n)}#`.slice(0, 200);

const SORT: Record<string, (o: Prisma.SortOrder) => Prisma.InvoiceOrderByWithRelationInput> = {
  id: (o) => ({ id: o }), no: (o) => ({ no: o }), date: (o) => ({ date: o }), paidDate: (o) => ({ paidDate: o }), status: (o) => ({ status: o }),
  total: (o) => ({ total: o }), subTotal: (o) => ({ subTotal: o }), billToName: (o) => ({ billedTo: o }),
  sponsorName: (o) => ({ sponsorId: o }), companyName: (o) => ({ companyId: o }),
};

/** invoicetax tidak menyimpan TaxId; pajak master dikenali dari deskripsinya ("VAT (11%)", "PPH 23"). */
export function taxIdFor(description: string, master: { id: number; name: string }[]) {
  const d = normName(description);
  return master.find((m) => normName(m.name) === d)?.id
    ?? master.find((m) => { const first = normName(m.name).split(' ')[0]; return !!first && d.startsWith(first); })?.id
    ?? null;
}

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger('Invoices');

  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ClientsService,
    private readonly kontrak: KontrakService,
  ) {}

  // ───────────── Baca ─────────────

  /** Nama company/sponsor/bank, status request terakhir, dan jumlah nama TKA untuk sekumpulan invoice. */
  private async decorate(rows: (Invoice & { billTo?: { companyName: string } | null })[]): Promise<InvoiceRow[]> {
    const ids = rows.map((r) => r.id);
    const [companies, sponsors, banks, reqs, names] = await Promise.all([
      this.prisma.company.findMany({ select: { id: true, name: true } }),
      this.prisma.sponsor.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.sponsorId ?? 0))] } }, select: { id: true, name: true } }),
      this.prisma.bankAccount.findMany({ select: { id: true, bankName: true, accountNo: true } }),
      ids.length ? this.prisma.updateRequest.findMany({ where: { invoiceId: { in: ids } }, orderBy: { id: 'desc' }, select: { invoiceId: true, status: true } }) : [],
      ids.length ? this.prisma.invoiceDetail.groupBy({ by: ['invoiceId'], where: { invoiceId: { in: ids.map(Number) }, qty: 0 }, _count: { _all: true } }) : [],
    ]);
    const cName = new Map(companies.map((c) => [c.id, c.name]));
    const sName = new Map(sponsors.map((s) => [s.id, s.name]));
    const bank = new Map(banks.map((b) => [b.id, `${b.bankName} _ ${b.accountNo}`]));
    const lastReq = new Map<number, string | null>();
    for (const r of reqs) if (!lastReq.has(Number(r.invoiceId))) lastReq.set(Number(r.invoiceId), r.status);
    const nameCount = new Map(names.map((n) => [n.invoiceId, n._count._all]));
    return rows.map((i) => ({
      id: Number(i.id), no: i.no?.trim() || null, date: d2s(i.date), paidDate: d2s(i.paidDate), status: toStatus(i.status),
      companyId: i.companyId || null, companyName: i.companyId ? cName.get(i.companyId) ?? null : null,
      sponsorId: i.sponsorId || null, sponsorName: i.sponsorId ? sName.get(i.sponsorId) ?? null : null,
      billToId: i.billToId || null, billToName: i.billTo?.companyName ?? (i.billedTo?.trim() || null), npwp: i.npwp?.trim() || null,
      subTotal: Number(i.subTotal ?? 0), total: Number(i.total ?? 0), information: i.additionalInformation?.trim() || null,
      bankAccountLabel: i.bankAccountId ? bank.get(i.bankAccountId) ?? null : null,
      requestStatus: toRequestStatus(lastReq.get(Number(i.id)) ?? null), clientCount: nameCount.get(Number(i.id)) ?? 0, createdBy: null,
    }));
  }

  private async where(q: InvoiceListQueryDto): Promise<Prisma.InvoiceWhereInput> {
    const and: Prisma.InvoiceWhereInput[] = [];
    const s = q.search?.trim();
    if (s) {
      const ci = { contains: s };
      const [sponsors, companies, byName] = await Promise.all([
        this.prisma.sponsor.findMany({ where: { name: ci }, select: { id: true } }),
        this.prisma.company.findMany({ where: { name: ci }, select: { id: true } }),
        // Nama TKA ada di baris detail (Qty 0).
        this.prisma.invoiceDetail.findMany({ where: { qty: 0, description: ci }, select: { invoiceId: true }, distinct: ['invoiceId'], take: 2000 }),
      ]);
      and.push({
        OR: [
          { no: ci }, { additionalInformation: ci }, { npwp: ci }, { billedTo: ci },
          ...(sponsors.length ? [{ sponsorId: { in: sponsors.map((x) => x.id) } }] : []),
          ...(companies.length ? [{ companyId: { in: companies.map((x) => x.id) } }] : []),
          ...(byName.length ? [{ id: { in: byName.map((x) => BigInt(x.invoiceId ?? 0)) } }] : []),
          ...(/^\d+$/.test(s) ? [{ id: BigInt(s) }] : []),
        ],
      });
    }
    if (q.status) and.push(q.status === 'DRAFT' ? { NOT: { status: { in: ['FINAL', 'PAID'] } } } : { status: q.status });
    if (q.from) and.push({ date: { gte: s2d(q.from)! } });
    if (q.to) and.push({ date: { lte: s2d(q.to)! } });
    if (q.sponsorId) and.push({ sponsorId: q.sponsorId });
    if (q.billToId) and.push({ billToId: q.billToId });
    return { AND: and };
  }

  private orderBy(q: InvoiceListQueryDto): Prisma.InvoiceOrderByWithRelationInput[] {
    return q.sort && SORT[q.sort] ? [SORT[q.sort](q.order), { id: 'desc' }] : [{ id: 'desc' }];
  }

  async list(q: InvoiceListQueryDto): Promise<InvoiceList> {
    const where = await this.where(q);
    const [rows, total, sum] = await Promise.all([
      this.prisma.invoice.findMany({ where, include: { billTo: { select: { companyName: true } } }, orderBy: this.orderBy(q), skip: q.skip, take: q.pageSize }),
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.aggregate({ where, _sum: { total: true } }),
    ]);
    return { ...paginated(await this.decorate(rows), total, q), amount: Number(sum._sum.total ?? 0) };
  }

  async exportRows(q: InvoiceListQueryDto) {
    const rows = await this.prisma.invoice.findMany({ where: await this.where(q), include: { billTo: { select: { companyName: true } } }, orderBy: this.orderBy(q), take: 50_000 });
    const terb = new Map(rows.map((r) => [Number(r.id), r.totalTerbilang]));
    return (await this.decorate(rows)).map((r) => ({ ...r, totalTerbilang: terb.get(r.id) ?? null }));
  }

  private async find(id: number) {
    const i = await this.prisma.invoice.findUnique({ where: { id: BigInt(id) }, include: { billTo: { select: { companyName: true } } } });
    if (!i) throw new NotFoundException('Invoice tidak ditemukan.');
    return i;
  }

  /** Grup layanan + nama TKA dari baris invoicedetail (client dicocokkan lewat nama). */
  private async groups(inv: Invoice): Promise<Group[]> {
    const rows = await this.prisma.invoiceDetail.findMany({ where: { invoiceId: Number(inv.id) }, orderBy: { id: 'asc' } });
    const clientNos = [...new Set(rows.map((r) => r.clientNo).filter((x): x is bigint => !!x))];
    const [linked, candidates] = await Promise.all([
      clientNos.length ? this.prisma.client.findMany({ where: { no: { in: clientNos } }, select: { no: true, name: true } }) : [],
      inv.no?.trim() ? this.prisma.client.findMany({ where: { noInvoice: inv.no.trim(), isDelete: false }, select: { no: true, name: true } }) : [],
    ]);
    const nameOf = new Map(linked.map((c) => [Number(c.no), c.name]));
    return rowsToGroups(rows, (no) => nameOf.get(no), candidates.map((c) => ({ no: Number(c.no), name: c.name })));
  }

  private async attachments(invoiceId: number): Promise<InvoiceAttachmentRow[]> {
    // Ukuran dihitung di database supaya blob tidak ikut terbaca. Lampiran rujukan memakai blob tabel attachment.
    const rows = await this.prisma.$queryRaw<{ id: bigint; name: string | null; size: bigint | number | null; ref: bigint | null; refName: string | null; refSize: bigint | number | null }[]>`
      SELECT ia.InvoiceAttachmentId AS id, ia.InvoiceAttachmentName AS name, LENGTH(ia.InvoiceAttachmentBlob) AS size,
             ia.InvoiceAttachmentIdInvoice AS ref, a.AttachmentName AS refName, LENGTH(a.AttachmentBlob) AS refSize
      FROM invoiceattachment ia LEFT JOIN attachment a ON a.AttachmentId = ia.InvoiceAttachmentIdInvoice
      WHERE ia.InvoiceAttachmentInvoiceId = ${invoiceId} ORDER BY ia.InvoiceAttachmentId`;
    return rows.map((r) => {
      const name = r.ref ? attachmentName(r.refName, Number(r.ref)) : attachmentName(r.name, Number(r.id)).replace(/^lampiran-/, 'lampiran-invoice-');
      const size = Number(r.ref ? r.refSize ?? 0 : r.size ?? 0);
      return { id: Number(r.id), originalName: name, mime: mimeOf(name), size: size || null, uploadedAt: null };
    });
  }

  async get(id: number): Promise<InvoiceDetail> {
    const inv = await this.find(id);
    const [[row], groups, taxes, attachments, requests, master] = await Promise.all([
      this.decorate([inv]), this.groups(inv),
      this.prisma.invoiceTax.findMany({ where: { invoiceId: id }, orderBy: { id: 'asc' } }),
      this.attachments(id), this.requestRows({ invoiceId: BigInt(id) }), this.prisma.tax.findMany(),
    ]);
    const clientIds = groups.flatMap((g) => g.clients.map((c) => c.clientId)).filter((x): x is number => !!x);
    const paspor = new Map((clientIds.length ? await this.prisma.client.findMany({ where: { no: { in: clientIds.map(BigInt) } }, select: { no: true, noPaspor: true } }) : [])
      .map((c) => [Number(c.no), c.noPaspor?.trim() || null]));
    return {
      ...row,
      bankAccountId: inv.bankAccountId || null,
      totalTerbilang: inv.totalTerbilang?.trim() || null,
      createdAt: d2s(inv.date) ?? '',
      groups: groups.map((g) => ({ clients: g.clients.map((c) => ({ id: c.clientId, name: c.name, noPaspor: c.clientId ? paspor.get(c.clientId) ?? null : null })), items: g.items })),
      taxes: taxes.map((t) => ({ id: Number(t.id), taxId: taxIdFor(t.description, master), description: t.description, value: Number(t.value) })),
      attachments,
      requests,
      editable: isEditable(inv),
    };
  }

  async printData(id: number): Promise<InvoicePrintData> {
    const invoice = await this.get(id);
    const [company, billTo, bank] = await Promise.all([
      invoice.companyId ? this.prisma.company.findUnique({ where: { id: invoice.companyId } }) : null,
      invoice.billToId ? this.prisma.billTo.findUnique({ where: { id: invoice.billToId } }) : null,
      invoice.bankAccountId ? this.prisma.bankAccount.findUnique({ where: { id: invoice.bankAccountId } }) : null,
    ]);
    return {
      invoice,
      company: company && { name: company.name, address: company.address || null, signedBy: company.invoiceSignedBy || null, signedTitle: 'Finance' },
      billTo: billTo
        ? { companyName: billTo.companyName, npwp: billTo.npwp || null, address: [billTo.alamat1, billTo.alamat2, billTo.alamat3, billTo.alamat4].filter((a) => a?.trim()) }
        : invoice.billToName ? { companyName: invoice.billToName, npwp: invoice.npwp, address: [] } : null,
      bank: bank && {
        bankName: bank.bankName, branch: bank.branch || null, swiftcode: bank.swiftcode || null, accountFor: bank.accountFor || company?.name || null, accountNo: bank.accountNo,
        address: [bank.address1, bank.address2, bank.address3, bank.address4].filter((a) => a?.trim()).join('\n') || null,
      },
    };
  }

  // ───────────── Create Invoice ─────────────

  /** Client yang bisa di-invoice (belum punya No Invoice, tidak diarsip/dihapus). Maks 500 baris. */
  async invoiceable(q: InvoiceableQueryDto): Promise<InvoiceableClientRow[]> {
    const and: Prisma.ClientWhereInput[] = [INVOICEABLE];
    const [projects, billTos] = await Promise.all([this.prisma.sponsorProject.findMany(), this.prisma.billTo.findMany()]);
    const projectBillTo = new Map(projects.map((p) => [p.id, matchBillTo(p, billTos)]));
    if (q.sponsorId) and.push({ sponsorId: q.sponsorId });
    if (q.projectId) and.push({ projectId: q.projectId });
    if (q.billToId) and.push({ projectId: { in: projects.filter((p) => projectBillTo.get(p.id) === q.billToId).map((p) => p.id) } });
    const s = q.search?.trim();
    if (s) and.push({ OR: [{ name: { contains: s } }, { noPaspor: { contains: s } }] });
    const rows = await this.prisma.client.findMany({ where: { AND: and }, orderBy: { no: 'desc' }, take: 500 });
    const pName = new Map(projects.map((p) => [p.id, p.name]));
    return rows.map((c) => ({
      id: Number(c.no), name: c.name, noPaspor: c.noPaspor?.trim() || null, sponsorId: c.sponsorId || null, sponsorName: c.sponsor?.trim() || null,
      projectName: c.projectId ? pName.get(c.projectId) ?? null : null, keperluanName: c.keperluan?.trim() || null,
      billToId: c.projectId ? projectBillTo.get(c.projectId) ?? null : null,
      tanggalPermohonan: d2s(c.tanggalPermohonan), tanggalProsesSelesai: d2s(c.tanggalProsesSelesai),
    }));
  }

  priceList(billToId: number, date?: string) {
    return this.kontrak.priceList(billToId, date ?? todayStr());
  }

  /**
   * Nomor invoice berikutnya seperti aplikasi lama: @autonumber@ = CompanyInvoiceLastNo + 1, lalu LastNo dinaikkan.
   * Baris company dikunci (SELECT … FOR UPDATE) supaya dua Create Invoice bersamaan tidak mendapat nomor yang sama;
   * bila nomor hasil format sudah dipakai invoice lain, penghitung dinaikkan lagi.
   */
  private async nextNumber(tx: Prisma.TransactionClient, companyId: number, date: string) {
    await tx.$queryRaw`SELECT CompanyId FROM company WHERE CompanyId = ${companyId} FOR UPDATE`;
    const co = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
    let seq = co.invoiceLastNo;
    let no: string;
    do {
      seq += 1;
      no = formatInvoiceNo(co.invoiceNoFormat, seq, date);
    } while (await tx.invoice.count({ where: { no } }));
    await tx.company.update({ where: { id: companyId }, data: { invoiceLastNo: seq } });
    return no;
  }

  /**
   * Buat invoice DRAFT dari client terpilih: satu grup per Keperluan (pax = jumlah client), harga dari Kontrak Bill To.
   * Bill To = pilihan user atau hasil pencocokan Sponsor Project client pertama.
   */
  async create(dto: CreateInvoiceDto, user: AuthUser): Promise<CreateInvoiceResult> {
    const ids = [...new Set(dto.clientIds)];
    const company = await this.prisma.company.findFirst({ where: { id: dto.companyId, NOT: { id: 0 } } });
    if (!company) throw new BadRequestException('Company tidak ditemukan.');
    const clients = await this.prisma.client.findMany({ where: { no: { in: ids.map(BigInt) }, isDelete: false }, orderBy: { no: 'asc' } });
    if (clients.length !== ids.length) throw new BadRequestException('Sebagian client tidak ditemukan.');
    const taken = clients.filter((c) => c.noInvoice?.trim());
    if (taken.length) throw new BadRequestException(`Client sudah punya invoice: ${taken.slice(0, 5).map((c) => c.name).join(', ')}${taken.length > 5 ? ', …' : ''}.`);

    const date = todayStr();
    let billToId = dto.billToId || null;
    if (!billToId) {
      const projectId = clients.find((c) => c.projectId)?.projectId;
      const project = projectId ? await this.prisma.sponsorProject.findUnique({ where: { id: projectId } }) : null;
      if (project) billToId = matchBillTo(project, await this.prisma.billTo.findMany());
    }
    const billTo = billToId ? await this.prisma.billTo.findUnique({ where: { id: billToId } }) : null;
    if (billToId && !billTo) throw new BadRequestException('Bill To tidak ditemukan.');
    const prices = await this.kontrak.priceList(billToId, date);
    const info = company.invoiceInformation?.trim()
      || (await this.prisma.systemConfigurator.findFirst({ where: { key: 'Default Additional Information' } }))?.value || '';

    const byKeperluan = new Map<number, typeof clients>();
    for (const c of clients) byKeperluan.set(c.keperluanId, [...(byKeperluan.get(c.keperluanId) ?? []), c]);
    let missingPrice = 0;
    const groups: Group[] = [...byKeperluan.entries()].map(([kid, members]) => {
      const price = prices.find((p) => p.keperluanId === kid)?.price ?? 0;
      if (!price) missingPrice++;
      return {
        items: [{ description: (members[0].keperluan?.trim() || 'Jasa').slice(0, 100), keperluanId: kid || null, qty: members.length, unitPrice: price, subTotal: members.length * price }],
        clients: members.map((c) => ({ clientId: Number(c.no), name: c.name })),
      };
    });
    const { subTotal, total } = computeInvoiceTotals(groups, [], []);

    const inv = await this.prisma.$transaction(async (tx) => {
      const no = await this.nextNumber(tx, company.id, date);
      const created = await tx.invoice.create({
        data: {
          no, companyId: company.id, sponsorId: clients[0].sponsorId || null, billToId: billTo?.id ?? null, billedTo: billTo?.companyName ?? '',
          npwp: billTo?.npwp ?? '', date: s2d(date), paidDate: GX_EMPTY_DATE, status: 'DRAFT', editStatus: '', additionalInformation: info,
          bankAccountId: company.bankAccountId || null, subTotal: BigInt(Math.round(subTotal)), total: BigInt(Math.round(total)), totalTerbilang: terbilangLegacy(total),
        },
      });
      await tx.invoiceDetail.createMany({ data: groupsToRows(groups).map((r) => ({ ...r, invoiceId: Number(created.id) })) });
      // Syarat "belum ber-invoice" diulang di sini supaya client yang baru saja di-invoice user lain tidak tertimpa.
      const linked = await tx.client.updateMany({ where: { no: { in: ids.map(BigInt) }, ...INVOICEABLE }, data: { noInvoice: no, tanggalInvoice: s2d(date) } });
      if (linked.count !== ids.length) throw new ConflictException('Sebagian client baru saja dimasukkan ke invoice lain. Muat ulang daftar client.');
      return created;
    });

    for (const id of ids) await this.clients.log(user.id, id, 'Invoice');
    return { id: Number(inv.id), no: inv.no, missingPrice };
  }

  // ───────────── Simpan ─────────────

  /**
   * Client yang kolom No Invoice-nya dikelola invoice ini. Bila nomor invoice dipakai lebih dari satu invoice (data lama),
   * hanya client yang tercantum di invoice ini yang dihitung.
   */
  private async ownedClients(inv: Invoice, members: Set<number>) {
    if (!inv.no?.trim()) return [];
    const [rows, sameNo] = await Promise.all([
      this.prisma.client.findMany({ where: { noInvoice: inv.no.trim(), isDelete: false }, select: { no: true } }),
      this.prisma.invoice.count({ where: { no: inv.no.trim() } }),
    ]);
    return rows.map((r) => Number(r.no)).filter((n) => sameNo <= 1 || members.has(n));
  }

  async save(id: number, dto: SaveInvoiceDto, user: AuthUser): Promise<InvoiceDetail> {
    const inv = await this.find(id);
    if (!isEditable(inv)) throw new ForbiddenException(`Invoice sudah ${toStatus(inv.status)} dan terkunci. Ajukan "Request To Edit" terlebih dahulu.`);

    // Buang item kosong dan grup yang tidak berisi item maupun nama.
    const groups: Group[] = dto.groups
      .map((g) => ({
        clients: g.clients.map((c) => ({ clientId: c.clientId || null, name: c.name?.trim() ?? '' })),
        items: g.items
          .filter((it) => it.description.trim() || Number(it.unitPrice))
          .map((it) => ({ description: it.description.trim(), keperluanId: it.keperluanId || null, qty: it.qty, unitPrice: it.unitPrice, subTotal: it.qty * it.unitPrice })),
      }))
      .filter((g) => g.items.length || g.clients.length);
    if (groups.some((g) => g.items.some((it) => !it.description))) throw new BadRequestException('Description item wajib diisi.');
    if (groups.some((g) => g.clients.some((c) => !c.clientId && !c.name))) throw new BadRequestException('Nama TKA tanpa data client wajib diisi.');

    const clientIds = groups.flatMap((g) => g.clients.map((c) => c.clientId).filter((x): x is number => !!x));
    const unique = new Set(clientIds);
    if (unique.size !== clientIds.length) throw new BadRequestException('Satu client tidak boleh tercantum lebih dari sekali.');

    const before = await this.groups(inv);
    const members = new Set(before.flatMap((g) => g.clients.map((c) => c.clientId)).filter((x): x is number => !!x));
    const owned = new Set(await this.ownedClients(inv, members));
    const added = [...unique].filter((c) => !members.has(c) && !owned.has(c));
    const found = unique.size ? await this.prisma.client.findMany({ where: { no: { in: [...unique].map(BigInt) }, isDelete: false }, select: { no: true, name: true, noInvoice: true } }) : [];
    if (found.length !== unique.size) throw new BadRequestException('Sebagian client tidak ditemukan.');
    const taken = found.filter((c) => added.includes(Number(c.no)) && c.noInvoice?.trim());
    if (taken.length) throw new BadRequestException(`Client sudah punya invoice lain: ${taken.slice(0, 5).map((c) => c.name).join(', ')}.`);
    const nameOf = new Map(found.map((c) => [Number(c.no), c.name]));
    for (const g of groups) for (const c of g.clients) if (!c.name && c.clientId) c.name = nameOf.get(c.clientId) ?? '';

    const no = dto.no?.trim() || inv.no?.trim() || null;
    if (no && no !== inv.no?.trim() && (await this.prisma.invoice.count({ where: { no, id: { not: inv.id } } }))) {
      throw new ConflictException(`Nomor invoice ${no} sudah dipakai invoice lain.`);
    }
    const date = dto.date || null;
    if (dto.status !== 'DRAFT') {
      const missing = [!no && 'Invoice No', !date && 'Invoice Date', !dto.companyId && 'Company', !dto.billToId && 'Bill To'].filter(Boolean);
      if (missing.length) throw new BadRequestException(`Invoice ${dto.status} wajib punya ${missing.join(', ')}.`);
      if (!groups.some((g) => g.items.length)) throw new BadRequestException(`Invoice ${dto.status} minimal berisi satu item.`);
    }
    const paidDate = dto.status === 'PAID' ? dto.paidDate || todayStr() : null;

    const master = (await this.prisma.tax.findMany()).map((t) => ({ id: t.id, name: t.name, percentage: t.percentage, type: t.additionReduction }));
    const taxes = dto.taxes
      .map((t) => ({ ...t, taxId: t.taxId || null, description: t.description.trim() }))
      .filter((t) => t.taxId || t.description || Number(t.value));
    if (taxes.some((t) => t.taxId && !master.some((m) => m.id === t.taxId))) throw new BadRequestException('Pajak tidak ditemukan.');
    const totals = computeInvoiceTotals(groups, taxes, master);
    const billTo = dto.billToId ? await this.prisma.billTo.findUnique({ where: { id: dto.billToId } }) : null;
    if (dto.billToId && !billTo) throw new BadRequestException('Bill To tidak ditemukan.');

    const removed = [...owned].filter((c) => !unique.has(c));
    const keptOwned = [...owned].filter((c) => unique.has(c));
    const linkChanged = no !== (inv.no?.trim() || null) || date !== d2s(inv.date) || paidDate !== d2s(inv.paidDate);
    const linkData = { noInvoice: no, tanggalInvoice: s2d(date), tanggalPembayaranInvoice: s2d(paidDate) };
    const wasApproved = (inv.editStatus ?? '').toUpperCase() === 'APPROVED';

    await this.prisma.$transaction(async (tx) => {
      await tx.invoiceDetail.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceTax.deleteMany({ where: { invoiceId: id } });
      const rows = groupsToRows(groups);
      if (rows.length) await tx.invoiceDetail.createMany({ data: rows.map((r) => ({ ...r, invoiceId: id })) });
      if (taxes.length) {
        await tx.invoiceTax.createMany({
          data: taxes.map((t, i) => ({ invoiceId: id, value: BigInt(Math.round(totals.taxValues[i])), description: (t.description || master.find((m) => m.id === t.taxId)?.name || 'Other').slice(0, 100) })),
        });
      }
      await tx.invoice.update({
        where: { id: inv.id },
        data: {
          no, companyId: dto.companyId || null, sponsorId: dto.sponsorId || null, billToId: billTo?.id ?? null, billedTo: billTo?.companyName ?? inv.billedTo ?? '',
          npwp: dto.npwp?.trim() ?? '', date: s2d(date), paidDate: s2d(paidDate) ?? GX_EMPTY_DATE, status: dto.status, additionalInformation: dto.information?.trim() ?? '',
          bankAccountId: dto.bankAccountId || null, subTotal: BigInt(Math.round(totals.subTotal)), total: BigInt(Math.round(totals.total)),
          totalTerbilang: terbilangLegacy(totals.total), ...(wasApproved ? { editStatus: '' } : {}),
        },
      });
      // Kolom invoice di data client mengikuti invoice ini (hanya client yang dimiliki / baru ditambahkan).
      if (removed.length) {
        await tx.client.updateMany({ where: { no: { in: removed.map(BigInt) } }, data: { noInvoice: null, tanggalInvoice: null, tanggalPembayaranInvoice: null } });
      }
      if (keptOwned.length) await tx.client.updateMany({ where: { no: { in: keptOwned.map(BigInt) } }, data: linkData });
      if (added.length) {
        const linked = await tx.client.updateMany({ where: { no: { in: added.map(BigInt) }, ...INVOICEABLE }, data: linkData });
        if (linked.count !== added.length) throw new ConflictException('Sebagian client baru saja dimasukkan ke invoice lain. Muat ulang halaman.');
      }
      // Izin edit hanya berlaku untuk satu kali simpan.
      if (wasApproved) await tx.updateRequest.updateMany({ where: { invoiceId: inv.id, status: 'APPROVED' }, data: { status: 'DONE', updatedDate: s2d(todayStr())! } });
    });

    for (const c of removed) await this.clients.log(user.id, c, 'InvoiceRemove');
    for (const c of added) await this.clients.log(user.id, c, 'Invoice');
    if (linkChanged) for (const c of keptOwned) await this.clients.log(user.id, c, 'InvoiceUpdate');
    return this.get(id);
  }

  /** Hapus invoice: DRAFT oleh pemegang hak edit Invoice; FINAL/PAID hanya oleh yang berhak memutuskan Update Request. */
  async remove(id: number, user: AuthUser) {
    const inv = await this.find(id);
    if (toStatus(inv.status) !== 'DRAFT' && !canEdit(user.access, 'invoices.requests')) throw new ForbiddenException('Hanya invoice DRAFT yang bisa dihapus.');
    const members = new Set((await this.groups(inv)).flatMap((g) => g.clients.map((c) => c.clientId)).filter((x): x is number => !!x));
    const owned = await this.ownedClients(inv, members);
    await this.prisma.$transaction([
      this.prisma.client.updateMany({ where: { no: { in: owned.map(BigInt) } }, data: { noInvoice: null, tanggalInvoice: null, tanggalPembayaranInvoice: null } }),
      this.prisma.invoiceDetail.deleteMany({ where: { invoiceId: id } }),
      this.prisma.invoiceTax.deleteMany({ where: { invoiceId: id } }),
      this.prisma.invoiceAttachment.deleteMany({ where: { invoiceId: id } }),
      this.prisma.updateRequest.deleteMany({ where: { invoiceId: inv.id } }),
      this.prisma.printQueue.deleteMany({ where: { invoiceId: inv.id } }),
      this.prisma.invoice.delete({ where: { id: inv.id } }),
    ]);
    for (const c of owned) await this.clients.log(user.id, c, 'InvoiceRemove');
  }

  // ───────────── Lampiran ─────────────

  private async ensureEditable(id: number) {
    const inv = await this.find(id);
    if (!isEditable(inv)) throw new ForbiddenException(`Invoice sudah ${toStatus(inv.status)} dan terkunci. Ajukan "Request To Edit" terlebih dahulu.`);
  }

  /** Lampiran disimpan sebagai blob di tabel invoiceattachment. */
  async addAttachments(id: number, files: Express.Multer.File[]) {
    await this.ensureEditable(id);
    if (!files?.length) throw new BadRequestException('Tidak ada file yang diunggah.');
    await this.prisma.$transaction(files.map((f) => this.prisma.invoiceAttachment.create({
      data: { invoiceId: id, blob: new Uint8Array(f.buffer), name: Buffer.from(f.originalname, 'latin1').toString('utf8').slice(0, 255), url: '' },
    })));
    return this.attachments(id);
  }

  async attachment(aid: number) {
    const a = await this.prisma.invoiceAttachment.findUnique({ where: { id: BigInt(aid) } });
    if (!a) throw new NotFoundException('Lampiran tidak ditemukan.');
    if (a.attachmentRefId) {
      const ref = await this.prisma.attachment.findUnique({ where: { id: a.attachmentRefId } });
      if (!ref?.blob.length) throw new NotFoundException('Isi file lampiran tidak tersedia (belum disalin ke database ini).');
      const name = attachmentName(ref.name, Number(ref.id));
      return { name, mime: mimeOf(name, ref.blob), data: Buffer.from(ref.blob) };
    }
    if (!a.blob?.length) throw new NotFoundException('Isi file lampiran tidak tersedia (belum disalin ke database ini).');
    const name = attachmentName(a.name, aid).replace(/^lampiran-/, 'lampiran-invoice-');
    return { name, mime: mimeOf(name, a.blob), data: Buffer.from(a.blob) };
  }

  async removeAttachment(aid: number) {
    const a = await this.prisma.invoiceAttachment.findUnique({ where: { id: BigInt(aid) }, select: { id: true, invoiceId: true } });
    if (!a) throw new NotFoundException('Lampiran tidak ditemukan.');
    await this.ensureEditable(a.invoiceId);
    // Lampiran rujukan hanya dilepas dari invoice; file client-nya tetap ada.
    await this.prisma.invoiceAttachment.delete({ where: { id: a.id } });
  }

  // ───────────── Update Request ─────────────

  private async requestRows(where: Prisma.UpdateRequestWhereInput, page?: { skip: number; take: number }): Promise<UpdateRequestRow[]> {
    const rows = await this.prisma.updateRequest.findMany({ where, orderBy: { id: 'desc' }, ...(page ?? {}) });
    const [invoices, users] = await Promise.all([
      this.prisma.invoice.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.invoiceId))] } }, select: { id: true, no: true } }),
      this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, username: true } }),
    ]);
    const invNo = new Map(invoices.map((i) => [i.id, i.no]));
    const uName = new Map(users.map((u) => [u.id, u.username]));
    return rows.map((r) => ({
      id: Number(r.id), invoiceId: Number(r.invoiceId), invoiceNo: invNo.get(r.invoiceId) ?? null, status: toRequestStatus(r.status) ?? 'PENDING',
      reason: null, requestedBy: uName.get(r.userId) ?? null, decidedBy: null,
      createdAt: r.createdDate.toISOString(), updatedAt: r.updatedDate.getUTCFullYear() >= 1900 ? r.updatedDate.toISOString() : null,
    }));
  }

  async requestEdit(id: number, reason: string | undefined, user: AuthUser) {
    const inv = await this.find(id);
    if (toStatus(inv.status) === 'DRAFT') throw new BadRequestException('Invoice DRAFT bisa langsung diubah tanpa request.');
    const open = await this.prisma.updateRequest.count({ where: { invoiceId: inv.id, status: { in: ['PENDING', 'APPROVED'] } } });
    if (open) throw new BadRequestException('Masih ada request edit yang menunggu persetujuan / belum dipakai.');
    const today = s2d(todayStr())!;
    await this.prisma.$transaction([
      this.prisma.updateRequest.create({ data: { invoiceId: inv.id, userId: user.id, createdDate: today, updatedDate: today, status: 'PENDING' } }),
      this.prisma.invoice.update({ where: { id: inv.id }, data: { editStatus: 'PENDING' } }),
    ]);
    if (reason?.trim()) this.logger.log(`Request edit invoice ${inv.no} oleh ${user.username}: ${reason.trim()}`);
    return this.get(id);
  }

  async cancelRequest(id: number) {
    const inv = await this.find(id);
    const today = s2d(todayStr())!;
    const res = await this.prisma.updateRequest.updateMany({ where: { invoiceId: inv.id, status: { in: ['PENDING', 'APPROVED'] } }, data: { status: 'CANCELED', updatedDate: today } });
    if (!res.count) throw new BadRequestException('Tidak ada request edit yang bisa dibatalkan.');
    await this.prisma.invoice.update({ where: { id: inv.id }, data: { editStatus: 'CANCELED' } });
    return this.get(id);
  }

  async requests(q: RequestListQueryDto): Promise<Paginated<UpdateRequestRow>> {
    const and: Prisma.UpdateRequestWhereInput[] = [];
    if (q.status) and.push({ status: q.status === 'CANCELLED' ? 'CANCELED' : q.status });
    const s = q.search?.trim();
    if (s) {
      const [invoices, users] = await Promise.all([
        this.prisma.invoice.findMany({ where: { no: { contains: s } }, select: { id: true } }),
        this.prisma.user.findMany({ where: { username: { contains: s } }, select: { id: true } }),
      ]);
      and.push({ OR: [{ invoiceId: { in: invoices.map((i) => i.id) } }, { userId: { in: users.map((u) => u.id) } }] });
    }
    const where = { AND: and };
    const [rows, total] = await Promise.all([this.requestRows(where, { skip: q.skip, take: q.pageSize }), this.prisma.updateRequest.count({ where })]);
    return paginated(rows, total, q);
  }

  /** Setujui / tolak request PENDING. Peminta tidak boleh memutuskan request-nya sendiri (kecuali role Developer). */
  async decide(rid: number, approve: boolean, user: AuthUser) {
    const r = await this.prisma.updateRequest.findUnique({ where: { id: BigInt(rid) } });
    if (!r) throw new NotFoundException('Request tidak ditemukan.');
    const status = toRequestStatus(r.status);
    if (status !== 'PENDING') throw new BadRequestException(`Request sudah ${status}.`);
    if (r.userId === user.id && !user.isSuperRole) throw new ForbiddenException('Request sendiri harus diputuskan oleh user lain.');
    const decision = approve ? 'APPROVED' : 'REJECTED';
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.updateRequest.updateMany({ where: { id: r.id, status: 'PENDING' }, data: { status: decision, updatedDate: s2d(todayStr())! } });
      if (!res.count) throw new BadRequestException('Request sudah diputuskan user lain.');
      await tx.invoice.update({ where: { id: r.invoiceId }, data: { editStatus: decision } });
    });
  }
}
