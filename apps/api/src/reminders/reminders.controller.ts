import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { REMINDER_TYPES, todayStr, type ReminderOverview, type ReminderPrintData, type ReminderType } from '@sml/shared';
import { CurrentUser, Menu } from '../common/decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ReminderScheduler } from './reminder-scheduler.service.js';
import { CreateSystemConfigDto, ReminderItemsQueryDto, ReminderLogQueryDto, RunReminderDto, SystemConfigValueDto, TestEmailDto } from './reminders.dto.js';
import { RemindersService } from './reminders.service.js';
import { SystemConfigService } from './system-config.service.js';

@ApiTags('reminders')
@ApiBearerAuth()
@Menu('reminders')
@Controller('reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService, private readonly scheduler: ReminderScheduler) {}

  /** Jumlah per kategori, status jadwal, dan kesiapan SMTP/penerima. */
  @Get()
  async overview(): Promise<ReminderOverview> {
    const [items, cfg, recipients] = await Promise.all([this.reminders.items(), this.reminders.config(), this.reminders.recipientCounts()]);
    return {
      counts: Object.fromEntries(REMINDER_TYPES.map((t) => [t, items[t].length])) as Record<ReminderType, number>,
      schedule: this.scheduler.status(),
      smtpConfigured: Boolean(cfg['SMTP Host']?.trim()),
      recipients,
    };
  }

  @Get('items')
  async items(@Query() q: ReminderItemsQueryDto) {
    return (await this.reminders.items())[q.type];
  }

  /** Semua kategori sekaligus untuk cetak / PDF daftar reminder hari ini. */
  @Get('items/all')
  async allItems(): Promise<ReminderPrintData> {
    return { date: todayStr(), items: await this.reminders.items() };
  }

  @Get('logs')
  logs(@Query() q: ReminderLogQueryDto) {
    return this.reminders.logs(q);
  }

  @Post('run')
  run(@Body() dto: RunReminderDto, @CurrentUser() user: AuthUser) {
    return this.reminders.run(Boolean(dto.force), { userId: user.id, name: user.username });
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
