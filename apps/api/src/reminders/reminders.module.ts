import { Module } from '@nestjs/common';
import { ReminderScheduler } from './reminder-scheduler.service.js';
import { RemindersController, SystemConfigController } from './reminders.controller.js';
import { RemindersService } from './reminders.service.js';
import { SystemConfigService } from './system-config.service.js';

/** Email Reminder + penjadwal, dan System Configurator (perubahan key "Reminder …" memuat ulang jadwal). */
@Module({
  controllers: [RemindersController, SystemConfigController],
  providers: [RemindersService, ReminderScheduler, SystemConfigService],
})
export class RemindersModule {}
