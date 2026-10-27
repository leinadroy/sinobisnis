// Seed awal — aman dijalankan berulang (hanya membuat data yang belum ada).
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { DEFAULT_ACCESS } from '@sml/shared';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  // Role + matriks hak akses default (hanya untuk role yang belum punya matriks).
  for (const name of Object.keys(DEFAULT_ACCESS)) {
    const role = await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
    if ((await prisma.roleMenu.count({ where: { roleId: role.id } })) === 0) {
      await prisma.roleMenu.createMany({
        data: Object.entries(DEFAULT_ACCESS[name]).map(([menuKey, [view, edit]]) => ({
          roleId: role.id, menuKey, isActive: view === 1, allowEdit: edit === 1,
        })),
      });
    }
  }

  if ((await prisma.user.count()) === 0) {
    const dev = await prisma.role.findUniqueOrThrow({ where: { name: 'Developer' } });
    const username = process.env.ADMIN_USERNAME || 'admin';
    await prisma.user.create({
      data: {
        fullname: 'Administrator',
        username,
        passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10),
        roleId: dev.id,
      },
    });
    console.log(`User awal dibuat: ${username} (role Developer). Segera ganti password-nya.`);
  }

  if ((await prisma.tax.count()) === 0) {
    await prisma.tax.createMany({
      data: [
        { name: 'VAT (11%)', percentage: 11, type: 'ADDITION' },
        { name: 'PPH 23', percentage: 2, type: 'REDUCTION' },
      ],
    });
  }

  if ((await prisma.keperluan.count()) === 0) {
    const rows: [string, number, 'MONTHS' | 'DAYS'][] = [
      ['Alih Status 6 Bulan', 6, 'MONTHS'], ['Alih Status 12 Months', 12, 'MONTHS'], ['Alih Status ITAS ke ITAP', 0, 'MONTHS'],
      ['Bridging Visa', 60, 'DAYS'], ['Business Visa 211', 60, 'DAYS'], ['EPO (Exit Permit Only)', 0, 'DAYS'],
      ['EVOA 213 B', 30, 'DAYS'], ['Extend ITAS Investor 12 Bulan', 12, 'MONTHS'], ['EXTEND KITAS', 12, 'MONTHS'],
      ['ITAS Extension 12 Months', 12, 'MONTHS'], ['New ITAS 312 - 12 Months', 12, 'MONTHS'], ['Extend VOA', 30, 'DAYS'],
    ];
    await prisma.keperluan.createMany({ data: rows.map(([name, periode, periodeIn]) => ({ name, periode, periodeIn })) });
  }

  const templates = [
    ['EXPIRED_1', 'Template Reminder Expired Dokumen', 'Reminder Expired Dokumen', '<p>Dear Team,</p><p>Berikut daftar client yang dokumennya akan segera expired:</p>{{TABLE}}'],
    ['EXPIRED_2', 'Template Reminder Ke 2 Expired Dokumen', 'Reminder Ke 2 Expired Dokumen', '<p>Dear Team,</p><p><b>Reminder kedua</b> — dokumen client berikut akan expired dalam waktu dekat:</p>{{TABLE}}'],
    ['INVOICE_CREATE', 'Template Reminder Pembuatan Invoice', 'Reminder Pembuatan Invoice', '<p>Dear Finance,</p><p>Client berikut sudah selesai diproses namun belum dibuatkan invoice:</p>{{TABLE}}'],
    ['INVOICE_PAY', 'Template Reminder Pembayaran Invoice', 'Reminder Pembayaran Invoice', '<p>Dear Finance,</p><p>Invoice untuk client berikut belum dibayar:</p>{{TABLE}}'],
    ['EPO', 'Template Reminder EPO', 'Reminder EPO', '<p>Dear Team,</p><p>Client berikut memerlukan tindak lanjut EPO (Exit Permit Only):</p>{{TABLE}}'],
  ];
  for (const [code, description, subject, body] of templates) {
    await prisma.emailTemplate.upsert({ where: { code }, update: {}, create: { code, description, subject, body } });
  }

  const config: Record<string, string> = {
    SITE_URL: 'http://localhost:3000', SMTP_HOST: '', SMTP_PORT: '587', SMTP_SECURE: '0', SMTP_USERNAME: '',
    SMTP_PASSWORD: '', SMTP_FROM: '', REMINDER_CRON: '0 8 * * 1-5', REMINDER_ENABLED: '0', EXPIRED_SECOND_REMINDER_DAYS: '14',
  };
  for (const [key, value] of Object.entries(config)) {
    await prisma.systemConfig.upsert({ where: { key }, update: {}, create: { key, value } });
  }
}

main()
  .then(() => console.log('Seed selesai.'))
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
