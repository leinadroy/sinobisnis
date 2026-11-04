import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import {
  REMINDER_LABELS, REMINDER_LOG_PREFIX, REMINDER_TEMPLATE_ID, REMINDER_TYPES, todayStr,
  type ReminderItem, type ReminderLogList, type ReminderRunResult, type ReminderType,
} from '@sml/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { d2s, dt2s, s2d } from '../common/dates.js';
import { paginated } from '../common/list-query.dto.js';
import {
  addDays, buildBody, buildSubject, byType, categorize, daysFor, htmlTable, logText, parseLog, recipientsFor, successPrefix,
  type KeperluanReminder, type ReminderBatch, type ReminderSource,
} from './reminder.logic.js';
import type { ReminderLogQueryDto } from './reminders.dto.js';

/** TableName datalog untuk log reminder (sama dengan aplikasi lama). */
export const REMINDER_LOG_TABLE = 'Reminder';

/** Yang menjalankan reminder: user (kirim manual) atau penjadwal. */
export interface ReminderRunner {
  userId: number;
  name: string;
}
export const SYSTEM_RUNNER: ReminderRunner = { userId: 0, name: 'System' };

const STATUS_PREFIX = { SENT: 'Success Run ', FAILED: 'Failed Run ', 'NOT SENT': 'Not Sent Run ' } as const;

@Injectable()
export class RemindersService {
  private readonly logger = new Logger('Reminder');
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  /** Semua System Configurator sebagai map key → value (key lama berisi spasi, mis. "SMTP Host"). */
  async config(): Promise<Record<string, string>> {
    const rows = await this.prisma.systemConfigurator.findMany({ orderBy: { id: 'asc' } });
    const out: Record<string, string> = {};
    for (const r of rows) if (!(r.key in out)) out[r.key] = r.value;
    return out;
  }

  private async keperluan(): Promise<KeperluanReminder[]> {
    return this.prisma.keperluan.findMany({
      where: { id: { gt: 0 } },
      select: { id: true, name: true, reminderExpiredDokumen: true, reminderExpired2nd: true, reminderPembuatanInvoice: true, reminderPembayaranInvoice: true, reminderEpo: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Batch email (kategori × Keperluan) untuk tanggal `today`. */
  async batches(today = todayStr()): Promise<ReminderBatch[]> {
    const keps = await this.keperluan();
    // Hanya tanggal yang mungkin cocok (hari ke-N tiap Keperluan) yang diambil dari database.
    const expired = new Set<string>(), selesai = new Set<string>(), invoice = new Set<string>();
    for (const k of keps) {
      for (const t of REMINDER_TYPES) {
        const n = daysFor(t, k);
        if (n <= 0) continue;
        if (t === 'INVOICE_CREATE') selesai.add(addDays(today, -n));
        else if (t === 'INVOICE_PAY') invoice.add(addDays(today, -n));
        else expired.add(addDays(today, n));
      }
    }
    const dates = (s: Set<string>) => [...s].map((d) => s2d(d)!);
    const or: Prisma.ClientWhereInput[] = [];
    if (expired.size) or.push({ expiredDokumen: { in: dates(expired) } });
    if (selesai.size) or.push({ tanggalProsesSelesai: { in: dates(selesai) } });
    if (invoice.size) or.push({ tanggalInvoice: { in: dates(invoice) } });
    if (!or.length) return [];

    const rows = await this.prisma.client.findMany({
      where: { isDelete: false, isArchived: false, OR: or },
      orderBy: { name: 'asc' },
    });
    const projectIds = [...new Set(rows.map((r) => r.projectId).filter((x): x is number => Boolean(x)))];
    const projects = new Map(
      (projectIds.length ? await this.prisma.sponsorProject.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } }) : [])
        .map((p) => [p.id, p.name]),
    );
    const kepName = new Map(keps.map((k) => [k.id, k.name.trim()]));
    const text = (s: string | null) => (s?.trim() ? s.trim() : null);
    const sources: ReminderSource[] = rows.map((c) => ({
      id: Number(c.no), name: c.name, noPaspor: text(c.noPaspor), sponsorName: text(c.sponsor),
      projectName: c.projectId ? projects.get(c.projectId) ?? null : null,
      keperluanId: c.keperluanId, keperluanName: kepName.get(c.keperluanId) ?? text(c.keperluan),
      tanggalProsesSelesai: d2s(c.tanggalProsesSelesai), expiredDokumen: d2s(c.expiredDokumen),
      noInvoice: text(c.noInvoice), tanggalInvoice: d2s(c.tanggalInvoice),
      epo: text(c.epo), tanggalPembayaranInvoice: d2s(c.tanggalPembayaranInvoice),
    }));
    return categorize(sources, keps, today);
  }

  async items(today = todayStr()): Promise<Record<ReminderType, ReminderItem[]>> {
    return byType(await this.batches(today));
  }

  private transport(cfg: Record<string, string>) {
    const host = cfg['SMTP Host']?.trim();
    if (!host) return null;
    const port = Number(cfg['SMTP Port Numeric']) || 587;
    const useAuth = (cfg['SMTP Authentication Numeric']?.trim() ?? '1') !== '0' && Boolean(cfg['SMTP Username']?.trim());
    return nodemailer.createTransport({
      host, port, secure: port === 465,
      auth: useAuth ? { user: cfg['SMTP Username'].trim(), pass: cfg['SMTP Password'] ?? '' } : undefined,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
    });
  }

  private from(cfg: Record<string, string>) {
    return cfg['SMTP From']?.trim() || cfg['SMTP Username']?.trim() || undefined;
  }

  private activeRecipients() {
    return this.prisma.emailRecipient.findMany({ where: { isActive: true }, select: { address: true, isAccounting: true } });
  }

  async recipientCounts() {
    const recips = (await this.activeRecipients()).filter((r) => r.address.trim());
    return { general: recips.filter((r) => !r.isAccounting).length, accounting: recips.filter((r) => r.isAccounting).length };
  }


  /**
   * Kirim satu email per kategori per Keperluan yang punya client hari ini. Kombinasi yang sudah tercatat
   * "Success" hari ini dilewati kecuali `force`. Setiap kiriman dicatat di datalog (TableName 'Reminder').
   */
  async run(force = false, by: ReminderRunner = SYSTEM_RUNNER): Promise<ReminderRunResult[]> {
    if (this.running) throw new ConflictException('Reminder sedang dikirim. Tunggu sampai selesai.');
    this.running = true;
    try {
      const today = todayStr();
      const [batches, cfg, recips, templates] = await Promise.all([
        this.batches(today), this.config(), this.activeRecipients(), this.prisma.emailTemplate.findMany(),
      ]);
      const tx = this.transport(cfg);
      const from = this.from(cfg);
      const [yy, mm, dd] = today.split('-').map(Number);
      const since = new Date(yy, mm - 1, dd); // tengah malam lokal (kolom DATETIME berisi UTC)
      const summary = new Map<ReminderType, { sent: number; skipped: number; notSent: number; failed: number; count: number; notes: Set<string> }>();

      for (const b of batches) {
        const s = summary.get(b.type) ?? { sent: 0, skipped: 0, notSent: 0, failed: 0, count: 0, notes: new Set<string>() };
        summary.set(b.type, s);
        s.count += b.items.length;
        const already = !force && (await this.prisma.dataLog.count({
          // Log "(0 items)" (aplikasi lama mencatat semua Keperluan tiap hari) bukan kiriman, jadi tidak dihitung.
          where: {
            tableName: REMINDER_LOG_TABLE, created: { gte: since },
            description: { startsWith: successPrefix(b.type, b.keperluanName) }, NOT: { description: { contains: '(0 items)' } },
          },
        }));
        if (already) { s.skipped++; continue; }

        const tpl = templates.find((t) => t.id === REMINDER_TEMPLATE_ID[b.type]);
        const subject = buildSubject(tpl?.subject?.trim() || REMINDER_LABELS[b.type], b.keperluanName, b.items.length);
        const html = buildBody(tpl?.content ?? '', b.keperluanName, htmlTable(b.type, b.items, cfg['Site URL'] ?? ''));
        const to = recipientsFor(b.type, recips);
        const log = (status: 'SENT' | 'FAILED' | 'NOT SENT', note: string | null) => this.prisma.dataLog.create({
          data: {
            tableName: REMINDER_LOG_TABLE, tableId: 0, userId: by.userId, created: new Date(), tableAction: '',
            description: logText(status, b.type, b.keperluanName, b.items.length, by.name, note),
          },
        });

        if (!tx || !to.length) {
          const note = !tx ? 'SMTP Host belum diisi' : 'Belum ada Email Recipient aktif';
          await log('NOT SENT', note);
          s.notSent++; s.notes.add(note);
          continue;
        }
        try {
          await tx.sendMail({ from, to, subject, html });
          await log('SENT', null);
          s.sent++;
        } catch (e) {
          const note = e instanceof Error ? e.message : String(e);
          await log('FAILED', note);
          s.failed++; s.notes.add(note);
        }
      }

      const results: ReminderRunResult[] = [...summary.entries()].map(([type, s]) => {
        const status = s.failed ? 'FAILED' : s.notSent ? 'NOT SENT' : s.sent ? 'SENT' : 'SKIPPED';
        const parts = [s.sent && `${s.sent} email terkirim`, s.skipped && `${s.skipped} sudah terkirim hari ini`, s.notSent && `${s.notSent} tidak dikirim`, s.failed && `${s.failed} gagal`]
          .filter(Boolean).join(', ');
        return { type, status, count: s.count, note: [parts, ...s.notes].filter(Boolean).join(' — ') || null };
      });
      this.logger.log(`run by ${by.name}${force ? ' (paksa)' : ''}: ${results.map((r) => `${r.type}=${r.status}`).join(', ') || 'tidak ada item'}`);
      return results;
    } finally {
      this.running = false;
    }
  }

  /** Email uji untuk memastikan pengaturan SMTP benar. */
  async sendTest(to: string) {
    const cfg = await this.config();
    const tx = this.transport(cfg);
    if (!tx) throw new BadRequestException('SMTP Host belum diisi di System Configurator.');
    try {
      await tx.sendMail({
        from: this.from(cfg), to, subject: 'Tes SMTP Sinobisnis',
        html: '<p>Email uji dari aplikasi Sinobisnis. Bila email ini diterima, pengaturan SMTP sudah benar.</p>',
      });
    } catch (e) {
      throw new BadRequestException(`Gagal mengirim: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Log reminder dari datalog. Baris "(0 items)" (aplikasi lama mencatat semua Keperluan tiap hari) disembunyikan kecuali `withEmpty`. */
  async logs(q: ReminderLogQueryDto): Promise<ReminderLogList> {
    const and: Prisma.DataLogWhereInput[] = [{ tableName: REMINDER_LOG_TABLE }];
    if (!q.withEmpty) and.push({ NOT: { description: { contains: '(0 items)' } } });
    if (q.status) and.push({ description: { startsWith: STATUS_PREFIX[q.status as keyof typeof STATUS_PREFIX] } });
    if (q.type) and.push({ description: { contains: ` Run ${REMINDER_LOG_PREFIX[q.type as ReminderType]} ` } });
    const s = q.search?.trim();
    if (s) and.push({ description: { contains: s } });
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.dataLog.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.pageSize }),
      this.prisma.dataLog.count({ where }),
    ]);
    return paginated(rows.map((r) => {
      const p = parseLog(r.description);
      return {
        id: Number(r.id), createdAt: dt2s(r.created) ?? r.created.toISOString(), type: p.type ?? '', keperluan: p.keperluan, text: r.description,
        itemCount: p.itemCount, status: p.status, runBy: p.by, error: p.error,
      };
    }), total, q);
  }
}
