// Atur password user (disimpan bcrypt, UsersSalt = 'bcrypt'). User lama aplikasi GeneXus perlu ini sebelum bisa login.
//   npm run user:password -- <username>                        database DATABASE_URL (lokal)
//   npm run user:password -- <username> --profile production   profil DB_PROFILES; profil hanya-baca hanya bisa bila
//                                                              DB_WRITE_USERS_<PROFIL>=1 (lewat koneksi khusus tabel users)
//   USER_PASSWORD=... npm run user:password -- <username>
// Catatan: password bcrypt tidak bisa dipakai login di aplikasi GeneXus lama.
import 'dotenv/config';
import readline from 'node:readline';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { createAdapter } from '../src/prisma/adapter.js';
import { usersOnlyClient } from '../src/prisma/users-only.js';
import { describeUrl, loadProfiles } from '../src/database/db-profiles.js';
import { hashPassword } from '../src/auth/password.js';

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s) => { if (s.startsWith(question)) process.stdout.write(question); };
    rl.question(question, (a) => { rl.close(); process.stdout.write('\n'); resolve(a); });
  });
}

function clientFromArgs(args: string[]): { prisma: PrismaClient; where: string } {
  const i = args.indexOf('--profile');
  if (i < 0) return { prisma: new PrismaClient({ adapter: createAdapter() }), where: 'DATABASE_URL' };
  const key = args[i + 1]?.trim().toLowerCase();
  const profile = loadProfiles().find((p) => p.key === key);
  if (!profile?.url) throw new Error(`Profil "${key ?? ''}" tidak ada / URL-nya kosong di apps/api/.env.`);
  const d = describeUrl(profile.url);
  const where = `profil ${profile.key} (${d.host}/${d.database})`;
  if (!profile.readOnly) return { prisma: new PrismaClient({ adapter: createAdapter(profile.url) }), where };
  if (!profile.usersWritable) throw new Error(`Profil ${profile.key} hanya-baca; set DB_WRITE_USERS_${profile.key.toUpperCase()}=1 untuk mengizinkan tabel users.`);
  return { prisma: usersOnlyClient(profile.url), where: `${where}, khusus tabel users` };
}

const args = process.argv.slice(2);
const { prisma, where } = clientFromArgs(args);
async function main() {
  const username = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--profile');
  if (!username) throw new Error('Pakai: npm run user:password -- <username> [--profile <profil>]');
  const user = await prisma.user.findFirst({ where: { username }, include: { role: true } });
  if (!user) throw new Error(`User ${username} tidak ditemukan di ${where}.`);
  const password = process.env.USER_PASSWORD ?? (await askHidden(`Password baru untuk ${username} di ${where}: `));
  if (password.length < 6) throw new Error('Password minimal 6 karakter.');
  await prisma.user.update({ where: { id: user.id }, data: { ...(await hashPassword(password)), isActive: true } });
  console.log(`Password ${username} (role ${user.role.name}) di ${where} sudah diatur; user diaktifkan.`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
