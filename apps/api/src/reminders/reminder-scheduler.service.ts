import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Cron } from 'croner';
import type { ReminderSchedule } from '@sml/shared';
import { RemindersService } from './reminders.service.js';

const DEFAULT_CRON = '0 8 * * 1-5';
const DEFAULT_TZ = 'Asia/Jakarta';

/**
 * Jadwal reminder otomatis di dalam proses API, diatur dari System Configurator
 * (REMINDER_ENABLED, REMINDER_CRON, REMINDER_TIMEZONE). Dimuat ulang otomatis saat key itu diubah.
 * Set env REMINDER_SCHEDULER=off untuk mematikannya di instance tertentu (mis. saat menjalankan lebih dari satu API).
 */
@Injectable()
export class ReminderScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('ReminderScheduler');
  private job: Cron | null = null;
  private state: ReminderSchedule = { enabled: false, cron: DEFAULT_CRON, timezone: DEFAULT_TZ, nextRun: null, error: null };

  constructor(private readonly reminders: RemindersService) {}

  async onModuleInit() {
    await this.reload().catch((e) => this.logger.error(`Gagal memuat jadwal: ${e instanceof Error ? e.message : e}`));
  }

  onModuleDestroy() {
    this.job?.stop();
  }

  async reload(): Promise<ReminderSchedule> {
    this.job?.stop();
    this.job = null;
    const cfg = await this.reminders.config();
    const cron = cfg.REMINDER_CRON?.trim() || DEFAULT_CRON;
    const timezone = cfg.REMINDER_TIMEZONE?.trim() || DEFAULT_TZ;
    const enabled = cfg.REMINDER_ENABLED === '1';
    let error: string | null = null;
    if (process.env.REMINDER_SCHEDULER === 'off') {
      error = 'Penjadwal dimatikan di server (REMINDER_SCHEDULER=off).';
    } else if (enabled) {
      try {
        this.job = new Cron(cron, { timezone, protect: true, name: 'reminder' }, async () => {
          await this.reminders.run(false, 'schedule').catch((e) => this.logger.error(`Reminder gagal: ${e instanceof Error ? e.message : e}`));
        });
      } catch (e) {
        error = `Jadwal tidak valid: ${e instanceof Error ? e.message : e}`;
      }
    }
    this.state = { enabled, cron, timezone, nextRun: this.job?.nextRun()?.toISOString() ?? null, error };
    this.logger.log(this.job ? `Reminder terjadwal: ${cron} (${timezone}), berikutnya ${this.state.nextRun}` : `Reminder otomatis nonaktif${error ? ` — ${error}` : ''}`);
    return this.state;
  }

  status(): ReminderSchedule {
    return { ...this.state, nextRun: this.job?.nextRun()?.toISOString() ?? null };
  }
}
