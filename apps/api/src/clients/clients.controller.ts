import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  Body, Controller, Delete, Get, Header, HttpCode, Param, ParseIntPipe, Patch, Post, Query, Res, StreamableFile,
  UploadedFiles, UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { diskStorage } from 'multer';
import type { ClientRow } from '@sml/shared';
import { CurrentUser, Menu } from '../common/decorators.js';
import { ListQueryDto } from '../common/list-query.dto.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ArchiveDto, ClientDto, ClientListQueryDto, ConversationDto, CreateClientDto } from './clients.dto.js';
import { ClientsService, UPLOAD_DIR } from './clients.service.js';

const upload = FilesInterceptor('files', 20, {
  storage: diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname).slice(0, 10)}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const CSV_COLUMNS: [keyof ClientRow, string][] = [
  ['id', 'No'], ['sponsorName', 'Sponsor'], ['projectName', 'Project'], ['tanggalPermohonan', 'Tanggal Permohonan'],
  ['permohonanHariKe3', 'Permohonan Hari Ke3'], ['name', 'Nama Client'], ['noPaspor', 'No Paspor'], ['tanggalLahir', 'Lahir'],
  ['noRptka', 'No RPTKA'], ['keperluanName', 'Keperluan'], ['tanggalProsesSelesai', 'Tanggal Proses Selesai'], ['status', 'Status'],
  ['expiredDokumen', 'Expired Dokumen'], ['epo', 'EPO'], ['noInvoice', 'No Invoice'], ['tanggalInvoice', 'Tanggal Invoice'],
  ['tanggalPembayaranInvoice', 'Pembayaran Invoice'], ['keteranganTka', 'Keterangan TKA'], ['tanggalTerbitDokumen', 'Terbit Dokumen'],
  ['tanggalMasukLastExp', 'Masuk Indo / Last Exp'], ['sktt', 'SKTT'], ['stm', 'STM'], ['archivedReason', 'Alasan Archive'],
];
const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

@ApiTags('clients')
@ApiBearerAuth()
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Menu('clients')
  @Get()
  list(@Query() q: ClientListQueryDto) {
    return this.clients.list(q, false);
  }

  @Menu('clients.archived')
  @Get('archived')
  archived(@Query() q: ClientListQueryDto) {
    return this.clients.list(q, true);
  }

  /** Export CSV sesuai filter list (archived=true untuk Client Archived). */
  @Menu('clients', 'view')
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(@Query() q: ClientListQueryDto, @Query('archived') archived: string, @Res({ passthrough: true }) res: Response) {
    const rows = await this.clients.exportRows(q, archived === 'true');
    res.setHeader('Content-Disposition', `attachment; filename="client${archived === 'true' ? '-archived' : ''}.csv"`);
    const head = CSV_COLUMNS.map(([, l]) => csvCell(l)).join(',');
    return '﻿' + [head, ...rows.map((r) => CSV_COLUMNS.map(([k]) => csvCell(r[k])).join(','))].join('\n');
  }

  @Menu('clients.people')
  @Get('people')
  people(@Query() q: ListQueryDto) {
    return this.clients.people(q);
  }

  @Menu('clients.log')
  @Get('logs')
  logs(@Query() q: ListQueryDto) {
    return this.clients.logs(q);
  }

  @Menu('clients', 'view')
  @Get('attachments/:aid/file')
  async download(@Param('aid', ParseIntPipe) aid: number, @Res({ passthrough: true }) res: Response) {
    const a = await this.clients.attachment(aid);
    res.setHeader('Content-Type', a.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(a.originalName)}`);
    return new StreamableFile(fs.createReadStream(a.file));
  }

  @Menu('clients')
  @Delete('attachments/:aid')
  @HttpCode(204)
  removeAttachment(@Param('aid', ParseIntPipe) aid: number, @CurrentUser() user: AuthUser) {
    return this.clients.removeAttachment(aid, user.username);
  }

  @Menu('clients')
  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.clients.get(id);
  }

  @Menu('clients')
  @Post()
  create(@Body() dto: CreateClientDto, @CurrentUser() user: AuthUser) {
    return this.clients.create(dto, user.username);
  }

  @Menu('clients')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: ClientDto, @CurrentUser() user: AuthUser) {
    return this.clients.update(id, dto, user.username);
  }

  @Menu('clients')
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.clients.remove(id, user.username);
  }

  @Menu('clients')
  @Post(':id/archive')
  @HttpCode(204)
  archive(@Param('id', ParseIntPipe) id: number, @Body() dto: ArchiveDto, @CurrentUser() user: AuthUser) {
    return this.clients.archive(id, dto.archive, dto.reason, user.username);
  }

  /** Menulis catatan cukup hak lihat client (sama seperti production). */
  @Menu('clients', 'view')
  @Post(':id/conversations')
  addConversation(@Param('id', ParseIntPipe) id: number, @Body() dto: ConversationDto, @CurrentUser() user: AuthUser) {
    return this.clients.addConversation(id, dto.message, user.fullname);
  }

  @Menu('clients')
  @Post(':id/attachments')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(upload)
  addAttachments(@Param('id', ParseIntPipe) id: number, @UploadedFiles() files: Express.Multer.File[], @CurrentUser() user: AuthUser) {
    return this.clients.addAttachments(id, files, user.username);
  }
}
