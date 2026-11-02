import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import {
  REMINDER_LABELS, REMINDER_TYPES, todayStr,
  type ReminderItem, type ReminderLogList, type ReminderRunResult, type ReminderType,
} from '@sml/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { d2s } from '../common/dates.js';
import { paginated } from '../common/list-query.dto.js';
import { buildSubject, categorize, htmlTable, recipientsFor, type ReminderSource } from './reminder.logic.js';
import type { ReminderLogQueryDto } from './reminders.dto.js';

/** Kandidat reminder (penyaring kasar di database; aturan sebenarnya di categorize()). */
const CANDIDATES: Prisma.ClientWhereInput = {
  isArchived: false,
  OR: [
    { expiredDokumen: { not: null } },
    { tanggalProsesSelesai: { not: null }, invoiceId: null },
    { tanggalInvoice: { not: null }, tanggalPembayaranInvoice: null },
    { tanggalProsesSelesai: null, keperluan: { OR: [{ name: { contains: 'EPO', mode: 'insensitive' } }, { name: { contains: 'Exit Permit', mode: 'insensitive' } }] } },
  ],
};

@Injectable()
export class RemindersService {
  private readonly logger = new Logger('Reminder');
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  /** Semua System Configurator sebagai map key → value. */
  async config(): Promise<Record<string, string>> {
    const rows = await this.prisma.systemConfig.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.value ?? '']));
  }

  async items(today = todayStr()): Promise<Record<ReminderType, ReminderItem[]>> {
    const [rows, cfg] = await Promise.all([
      this.prisma.client.findMany({
        where: CANDIDATES,
        include: {
          sponsor: { select: { name: true } },
          project: { select: { name: true } },
          keperluan: {
            select: { name: true, reminderExpiredDokumen: true, reminderExpired2nd: true, reminderPembuatanInvoice: true, reminderPembayaranInvoice: true },
          },
        },
        orderBy: { id: 'asc' },
      }),
      this.config(),
    ]);
    const sources: ReminderSource[] = rows.map((c) => ({
      id: c.id, name: c.name, noPaspor: c.noPaspor, sponsorName: c.sponsor?.name ?? null, projectName: c.project?.name ?? null,
      keperluanName: c.keperluan?.name ?? null, tanggalProsesSelesai: d2s(c.tanggalProsesSelesai), expiredDokumen: d2s(c.expiredDokumen),
      noInvoice: c.noInvoice, tanggalInvoice: d2s(c.tanggalInvoice), prosesPerpanjangan: c.prosesPerpanjangan,
      tanggalPembayaranInvoice: d2s(c.tanggalPembayaranInvoice), invoiceId: c.invoiceId,
      // Tanpa Keperluan dipakai default semua (null).
      reminderExpiredDokumen: c.keperluan?.reminderExpiredDokumen ?? null,
      reminderExpired2nd: c.keperluan?.reminderExpired2nd ?? null,
      reminderPembuatanInvoice: c.keperluan?.reminderPembuatanInvoice ?? null,
      reminderPembayaranInvoice: c.keperluan?.reminderPembayaranInvoice ?? null,
    }));
    return categorize(sources, today, Number(cfg.EXPIRED_SECOND_REMINDER_DAYS) || 14);
  }

  private transport(cfg: Record<string, string>) {
    if (!cfg.SMTP_HOST?.trim()) return null;
    return nodemailer.createTransport({
      host: cfg.SMTP_HOST.trim(),
      port: Number(cfg.SMTP_PORT) || 587,
      secure: cfg.SMTP_SECURE === '1',
      auth: cfg.SMTP_USERNAME ? { user: cfg.SMTP_USERNAME, pass: cfg.SMTP_PASSWORD } : undefined,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
    });
  }

  private activeRecipients() {
    return this.prisma.emailRecipient.findMany({ where: { isActive: true }, select: { email: true, type: true, isAccounting: true } });
  }

  async recipientCounts() {
    const recips = (await this.activeRecipients()).filter((r) => r.type === 'TO');
    return { general: recips.filter((r) => !r.isAccounting).length, accounting: recips.filter((r) => r.isAccounting).length };
  }

  /**
   * Kirim satu email per kategori yang punya item. Satu kategori hanya dikirim sekali per hari
   * (ref_key `TYPE:YYYY-MM-DD` berstatus SENT) kecuali `force`. Semua hasil dicatat di reminder_logs.
   */
  async run(force = false, trigger: 'manual' | 'schedule' = 'manual'): Promise<ReminderRunResult[]> {
    if (this.running) throw new ConflictException('Reminder sedang dikirim. Tunggu sampai selesai.');
    this.running = true;
    try {
      const today = todayStr();
      const [items, cfg, recips, templates] = await Promise.all([
        this.items(today), this.config(), this.activeRecipients(), this.prisma.emailTemplate.findMany(),
      ]);
      const tx = this.transport(cfg);
      const from = cfg.SMTP_FROM?.trim() || cfg.SMTP_USERNAME;
      const results: ReminderRunResult[] = [];

      for (const type of REMINDER_TYPES) {
        const list = items[type];
        if (!list.length) continue;
        const refKey = `${type}:${today}`;
        if (!force && (await this.prisma.reminderLog.count({ where: { refKey, status: 'SENT' } }))) {
          results.push({ type, status: 'SKIPPED', count: list.length, note: 'sudah terkirim hari ini' });
          continue;
        }
        const tpl = templates.find((t) => t.code === type);
        const subject = buildSubject(tpl?.subject?.trim() || REMINDER_LABELS[type], list.length, today);
        const body = tpl?.body?.includes('{{TABLE}}') ? tpl.body : `${tpl?.body ?? ''}{{TABLE}}`;
        const html = body.replaceAll('{{TABLE}}', htmlTable(type, list, cfg.SITE_URL ?? ''));
        const { to, cc, bcc } = recipientsFor(type, recips);
        const log = (status: string, error: string | null) => this.prisma.reminderLog.create({
          data: { type, refKey, subject, recipients: [...to, ...cc.map((e) => `cc:${e}`), ...bcc.map((e) => `bcc:${e}`)].join(', ') || null, itemCount: list.length, status, error },
        });

        if (!tx || !to.length) {
          const note = !tx ? 'SMTP belum dikonfigurasi' : 'Belum ada Email Recipient (TO) yang aktif';
          await log('NOT SENT', note);
          results.push({ type, status: 'NOT SENT', count: list.length, note });
          continue;
        }
        try {
          await tx.sendMail({ from, to, cc, bcc, subject, html });
          await log('SENT', null);
          results.push({ type, status: 'SENT', count: list.length, note: null });
        } catch (e) {
          const note = e instanceof Error ? e.message : String(e);
          await log('FAILED', note);
          results.push({ type, status: 'FAILED', count: list.length, note });
        }
      }
      this.logger.log(`${trigger}${force ? ' (paksa)' : ''}: ${results.map((r) => `${r.type}=${r.status}`).join(', ') || 'tidak ada item'}`);
      return results;
    } finally {
      this.running = false;
    }
  }

  /** Email uji untuk memastikan pengaturan SMTP benar. */
  async sendTest(to: string) {
    const cfg = await this.config();
    const tx = this.transport(cfg);
    if (!tx) throw new BadRequestException('SMTP_HOST belum diisi di System Configurator.');
    try {
      await tx.sendMail({
        from: cfg.SMTP_FROM?.trim() || cfg.SMTP_USERNAME, to, subject: 'Tes SMTP Sinobisnis',
        html: '<p>Email uji dari aplikasi Sinobisnis. Bila email ini diterima, pengaturan SMTP sudah benar.</p>',
      });
    } catch (e) {
      throw new BadRequestException(`Gagal mengirim: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async logs(q: ReminderLogQueryDto): Promise<ReminderLogList> {
    const and: Prisma.ReminderLogWhereInput[] = [];
    if (q.status) and.push({ status: q.status });
    if (q.type) and.push({ type: q.type });
    const s = q.search?.trim();
    if (s) and.push({ OR: [{ subject: { contains: s, mode: 'insensitive' } }, { recipients: { contains: s, mode: 'insensitive' } }, { error: { contains: s, mode: 'insensitive' } }] });
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.reminderLog.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.pageSize }),
      this.prisma.reminderLog.count({ where }),
    ]);
    return paginated(rows.map((r) => ({
      id: r.id, createdAt: r.createdAt.toISOString(), type: r.type, subject: r.subject, recipients: r.recipients,
      itemCount: r.itemCount, status: r.status, error: r.error,
    })), total, q);
  }
}
