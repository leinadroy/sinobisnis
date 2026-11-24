import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Post, Put, Query, Req, ServiceUnavailableException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { isReminderDate, REMINDER_TYPES, todayStr, type ReminderOverview, type ReminderPrintData, type ReminderType } from '@sml/shared';
import { CurrentUser, Menu, Public } from '../common/decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { Request } from 'express';
import { ReminderScheduler } from './reminder-scheduler.service.js';
import { CreateSystemConfigDto, ReminderDateQueryDto, ReminderItemsQueryDto, ReminderLogQueryDto, RunReminderDto, SystemConfigValueDto, TestEmailDto } from './reminders.dto.js';
import { RemindersService, SYSTEM_RUNNER } from './reminders.service.js';
import { SystemConfigService } from './system-config.service.js';

@ApiTags('reminders')
@ApiBearerAuth()
@Menu('reminders')
@Controller('reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService, private readonly scheduler: ReminderScheduler) {}

  private localTask(request: Request) {
    const address = request.socket.remoteAddress;
    if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') {
      throw new ForbiddenException('Pemicu reminder hanya dapat dipanggil dari VM sendiri.');
    }
  }

  /** Pemeriksaan Task Scheduler tanpa mengirim email. */
  @Public()
  @Get('run-schedule')
  async scheduleReady(@Req() request: Request) {
    this.localTask(request);
    const [cfg, recipients] = await Promise.all([this.reminders.config(), this.reminders.recipientCounts()]);
    if (!cfg['SMTP Host']?.trim() || recipients.general + recipients.accounting === 0) {
      throw new ServiceUnavailableException('SMTP atau Email Recipient aktif belum siap.');
    }
    return { status: 'ready', mode: 'windows-task', recipients };
  }

  /** Pemicu lokal tanpa sesi login; tidak mengirim ulang batch yang sukses hari ini. */
  @Public()
  @Post('run-schedule')
  @HttpCode(200)
  async runSchedule(@Req() request: Request) {
    this.localTask(request);
    if (request.headers['x-sinobisnis-task'] !== '1') {
      throw new ForbiddenException('Header pemicu Task Scheduler tidak ada.');
    }
    const results = await this.reminders.run(false, SYSTEM_RUNNER);
    if (results.some((r) => r.status === 'FAILED' || r.status === 'NOT SENT')) {
      throw new ServiceUnavailableException('Sebagian reminder gagal atau tidak terkirim; lihat Notification Log.');
    }
    return { status: 'ok', results };
  }

  private date(value?: string): string {
    if (value === undefined) return todayStr();
    if (!isReminderDate(value)) throw new BadRequestException('Tanggal harus valid dengan format YYYY-MM-DD.');
    return value;
  }

  /** Jumlah per kategori, status jadwal, dan kesiapan SMTP/penerima. */
  @Get()
  async overview(@Query() q: ReminderDateQueryDto): Promise<ReminderOverview> {
    const [items, cfg, recipients] = await Promise.all([this.reminders.items(this.date(q.date)), this.reminders.config(), this.reminders.recipientCounts()]);
    return {
      counts: Object.fromEntries(REMINDER_TYPES.map((t) => [t, items[t].length])) as Record<ReminderType, number>,
      schedule: this.scheduler.status(),
      smtpConfigured: Boolean(cfg['SMTP Host']?.trim()),
      recipients,
    };
  }

  @Get('items')
  async items(@Query() q: ReminderItemsQueryDto) {
    return (await this.reminders.items(this.date(q.date)))[q.type];
  }

  /** Semua kategori sekaligus untuk cetak / PDF daftar reminder hari ini. */
  @Get('items/all')
  async allItems(@Query() q: ReminderDateQueryDto): Promise<ReminderPrintData> {
    const date = this.date(q.date);
    return { date, items: await this.reminders.items(date) };
  }

  @Get('logs')
  logs(@Query() q: ReminderLogQueryDto) {
    return this.reminders.logs(q);
  }

  @Post('run')
  run(@Body() dto: RunReminderDto, @CurrentUser() user: AuthUser) {
    const clean = (xs?: string[]) => [...new Set((xs ?? []).map((x) => x.trim()).filter(Boolean))];
    const to = clean(dto.to);
    const manual = to.length ? { to, cc: clean(dto.cc).filter((x) => !to.includes(x)) } : undefined;
    return this.reminders.run(Boolean(dto.force), { userId: user.id, name: user.username }, manual);
  }

  @Post('reload-schedule')
  reload() {
    return this.scheduler.reload();
  }
}

@ApiTags('system-config')
@ApiBearerAuth()
@Menu('system-config')
@Controller('system-config')
export class SystemConfigController {
  constructor(private readonly config: SystemConfigService, private readonly reminders: RemindersService) {}

  @Get()
  list() {
    return this.config.list();
  }

  @Post()
  create(@Body() dto: CreateSystemConfigDto) {
    return this.config.create(dto.key, dto.value);
  }

  /** Kirim email uji memakai pengaturan SMTP yang tersimpan. */
  @Post('test-email')
  @HttpCode(204)
  testEmail(@Body() dto: TestEmailDto) {
    return this.reminders.sendTest(dto.to);
  }

  @Put(':key')
  set(@Param('key') key: string, @Body() dto: SystemConfigValueDto) {
    return this.config.set(key, dto.value);
  }

  @Delete(':key')
  @HttpCode(204)
  remove(@Param('key') key: string) {
    return this.config.remove(key);
  }
}
