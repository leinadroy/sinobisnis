import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SYSTEM_CONFIG_KEYS, systemConfigInfo, type SystemConfigRow } from '@sml/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReminderScheduler } from './reminder-scheduler.service.js';

/** Key bawaan aplikasi tidak bisa dihapus (cukup dikosongkan). */
const BUILT_IN = new Set(SYSTEM_CONFIG_KEYS.map((k) => k.key.toLowerCase()));
const isBuiltIn = (key: string) => BUILT_IN.has(key.toLowerCase());
/** Nilai key berisi rahasia tidak pernah dikirim ke browser. */
const isSecret = (key: string) => Boolean(systemConfigInfo(key)?.secret) || /password|secret|token|salt/i.test(key);

/** Tabel systemconfigurator (key teks tanpa unique index; baris pertama per key yang dipakai). */
@Injectable()
export class SystemConfigService {
  constructor(private readonly prisma: PrismaService, private readonly scheduler: ReminderScheduler) {}

  private toRow(key: string, value: string | null): SystemConfigRow {
    const info = systemConfigInfo(key);
    const secret = isSecret(key);
    return { key, value: secret ? null : value, hasValue: Boolean(value), secret, label: info?.label ?? null, help: info?.help ?? null };
  }

  private find(key: string) {
    return this.prisma.systemConfigurator.findFirst({ where: { key }, orderBy: { id: 'asc' } });
  }

  /** Semua key: key bawaan dulu (termasuk yang belum tersimpan), lalu key lain A–Z. */
  async list(): Promise<SystemConfigRow[]> {
    const rows = new Map<string, string>();
    for (const r of await this.prisma.systemConfigurator.findMany({ orderBy: { id: 'asc' } })) if (!rows.has(r.key)) rows.set(r.key, r.value);
    const extra = [...rows.keys()].filter((k) => !isBuiltIn(k)).sort((a, b) => a.localeCompare(b));
    return [...SYSTEM_CONFIG_KEYS.map((k) => k.key), ...extra].map((k) => this.toRow(k, rows.get(k) ?? null));
  }

  async set(key: string, value: string | null) {
    const v = value ?? '';
    const row = await this.find(key);
    if (row) await this.prisma.systemConfigurator.update({ where: { id: row.id }, data: { value: v } });
    else await this.prisma.systemConfigurator.create({ data: { key, value: v } });
    if (systemConfigInfo(key)?.schedule) await this.scheduler.reload();
    return this.toRow(key, v);
  }

  async create(key: string, value: string | null) {
    if (isBuiltIn(key) || (await this.find(key))) throw new ConflictException(`Key ${key} sudah ada.`);
    return this.set(key, value);
  }

  async remove(key: string) {
    if (isBuiltIn(key)) throw new ConflictException('Key bawaan aplikasi tidak bisa dihapus; kosongkan nilainya.');
    const res = await this.prisma.systemConfigurator.deleteMany({ where: { key } });
    if (!res.count) throw new NotFoundException('Key tidak ditemukan.');
  }
}
