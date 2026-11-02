import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SYSTEM_CONFIG_KEYS, systemConfigInfo, type SystemConfigRow } from '@sml/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReminderScheduler } from './reminder-scheduler.service.js';

/** Key bawaan aplikasi tidak bisa dihapus (cukup dikosongkan). */
const BUILT_IN = new Set(SYSTEM_CONFIG_KEYS.map((k) => k.key));
/** Nilai key berisi rahasia tidak pernah dikirim ke browser. */
const isSecret = (key: string) => Boolean(systemConfigInfo(key)?.secret) || /PASSWORD|SECRET|TOKEN/.test(key);

@Injectable()
export class SystemConfigService {
  constructor(private readonly prisma: PrismaService, private readonly scheduler: ReminderScheduler) {}

  private toRow(key: string, value: string | null): SystemConfigRow {
    const info = systemConfigInfo(key);
    const secret = isSecret(key);
    return { key, value: secret ? null : value, hasValue: Boolean(value), secret, label: info?.label ?? null, help: info?.help ?? null };
  }

  /** Semua key: urutan key bawaan dulu (termasuk yang belum tersimpan), lalu key tambahan A–Z. */
  async list(): Promise<SystemConfigRow[]> {
    const rows = new Map((await this.prisma.systemConfig.findMany()).map((r) => [r.key, r.value]));
    const extra = [...rows.keys()].filter((k) => !BUILT_IN.has(k)).sort();
    return [...SYSTEM_CONFIG_KEYS.map((k) => k.key), ...extra].map((k) => this.toRow(k, rows.get(k) ?? null));
  }

  async set(key: string, value: string | null) {
    const v = value ?? '';
    await this.prisma.systemConfig.upsert({ where: { key }, update: { value: v }, create: { key, value: v } });
    if (systemConfigInfo(key)?.schedule) await this.scheduler.reload();
    return this.toRow(key, v);
  }

  async create(key: string, value: string | null) {
    if (BUILT_IN.has(key) || (await this.prisma.systemConfig.count({ where: { key } }))) throw new ConflictException(`Key ${key} sudah ada.`);
    return this.set(key, value);
  }

  async remove(key: string) {
    if (BUILT_IN.has(key)) throw new ConflictException('Key bawaan aplikasi tidak bisa dihapus; kosongkan nilainya.');
    const res = await this.prisma.systemConfig.deleteMany({ where: { key } });
    if (!res.count) throw new NotFoundException('Key tidak ditemukan.');
  }
}
