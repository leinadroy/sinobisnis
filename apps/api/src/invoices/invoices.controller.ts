import {
  Body, Controller, Delete, ForbiddenException, Get, Header, HttpCode, Param, ParseIntPipe, Post, Put, Query, Res, StreamableFile, UploadedFiles, UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { canView } from '@sml/shared';
import { CurrentUser, Menu } from '../common/decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  CreateInvoiceDto, InvoiceableQueryDto, InvoiceListQueryDto, PriceListQueryDto, RequestEditDto, RequestListQueryDto, SaveInvoiceDto,
} from './invoices.dto.js';
import { fileDisposition } from '../clients/clients.service.js';
import { InvoicesService } from './invoices.service.js';

// Lampiran disimpan sebagai blob di tabel invoiceattachment (seperti aplikasi lama), jadi file ditahan di memori.
const upload = FilesInterceptor('files', 20, { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

type ExportRow = Awaited<ReturnType<InvoicesService['exportRows']>>[number];
const CSV_COLUMNS: [keyof ExportRow, string][] = [
  ['id', 'Id'], ['no', 'No'], ['companyName', 'Company'], ['sponsorName', 'Sponsor'], ['billToName', 'Billed To'], ['npwp', 'NPWP'],
  ['date', 'Date'], ['paidDate', 'Paid Date'], ['status', 'Status'], ['clientCount', 'Jumlah Client'], ['subTotal', 'Sub Total'],
  ['total', 'Total'], ['totalTerbilang', 'Total Terbilang'], ['information', 'Information'], ['bankAccountLabel', 'Bank Account'],
];
const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Menu('invoices')
  @Get()
  list(@Query() q: InvoiceListQueryDto) {
    return this.invoices.list(q);
  }

  @Menu('invoices')
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="invoice.csv"')
  async export(@Query() q: InvoiceListQueryDto) {
    const rows = await this.invoices.exportRows(q);
    const head = CSV_COLUMNS.map(([, l]) => csvCell(l)).join(',');
    return '﻿' + [head, ...rows.map((r) => CSV_COLUMNS.map(([k]) => csvCell(r[k])).join(','))].join('\n');
  }

  /** Client yang belum ber-invoice (Create Invoice / tambah client di form invoice): cukup hak lihat salah satu menu. */
  @Get('invoiceable-clients')
  invoiceable(@Query() q: InvoiceableQueryDto, @CurrentUser() user: AuthUser) {
    if (!canView(user.access, 'invoices') && !canView(user.access, 'invoices.create')) {
      throw new ForbiddenException('Role Anda tidak memiliki akses ke fitur ini.');
    }
    return this.invoices.invoiceable(q);
  }

  /** Daftar harga Kontrak yang berlaku untuk Bill To per tanggal (default hari ini). */
  @Menu('invoices', 'view')
  @Get('price-list')
  priceList(@Query() q: PriceListQueryDto) {
    return this.invoices.priceList(q.billToId, q.date);
  }

  @Menu('invoices.create')
  @Post()
  create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.invoices.create(dto, user);
  }

  @Menu('invoices.requests')
  @Get('requests')
  requests(@Query() q: RequestListQueryDto) {
    return this.invoices.requests(q);
  }

  @Menu('invoices.requests')
  @Post('requests/:rid/approve')
  @HttpCode(204)
  approve(@Param('rid', ParseIntPipe) rid: number, @CurrentUser() user: AuthUser) {
    return this.invoices.decide(rid, true, user);
  }

  @Menu('invoices.requests')
  @Post('requests/:rid/reject')
  @HttpCode(204)
  reject(@Param('rid', ParseIntPipe) rid: number, @CurrentUser() user: AuthUser) {
    return this.invoices.decide(rid, false, user);
  }

  @Menu('invoices', 'view')
  @Get('attachments/:aid/file')
  async download(@Param('aid', ParseIntPipe) aid: number, @Query('download') download: string | undefined, @Res({ passthrough: true }) res: Response) {
    const a = await this.invoices.attachment(aid);
    res.setHeader('Content-Type', a.mime);
    res.setHeader('Content-Disposition', fileDisposition(a.name, a.mime, download === '1'));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(a.data);
  }

  @Menu('invoices')
  @Delete('attachments/:aid')
  @HttpCode(204)
  removeAttachment(@Param('aid', ParseIntPipe) aid: number) {
    return this.invoices.removeAttachment(aid);
  }

  @Menu('invoices')
  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.invoices.get(id);
  }

  @Menu('invoices')
  @Get(':id/print')
  print(@Param('id', ParseIntPipe) id: number) {
    return this.invoices.printData(id);
  }

  @Menu('invoices')
  @Put(':id')
  save(@Param('id', ParseIntPipe) id: number, @Body() dto: SaveInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.invoices.save(id, dto, user);
  }

  @Menu('invoices')
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.invoices.remove(id, user);
  }

  @Menu('invoices')
  @Post(':id/attachments')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(upload)
  addAttachments(@Param('id', ParseIntPipe) id: number, @UploadedFiles() files: Express.Multer.File[]) {
    return this.invoices.addAttachments(id, files);
  }

  @Menu('invoices')
  @Post(':id/request-edit')
  requestEdit(@Param('id', ParseIntPipe) id: number, @Body() dto: RequestEditDto, @CurrentUser() user: AuthUser) {
    return this.invoices.requestEdit(id, dto.reason, user);
  }

  @Menu('invoices')
  @Post(':id/cancel-request')
  cancelRequest(@Param('id', ParseIntPipe) id: number) {
    return this.invoices.cancelRequest(id);
  }
}
