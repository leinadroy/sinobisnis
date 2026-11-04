// Atur password user (disimpan bcrypt, UsersSalt = 'bcrypt'). User lama aplikasi GeneXus perlu ini sebelum bisa login.
//   npm run user:password -- <username>            password diketik tersembunyi
//   USER_PASSWORD=... npm run user:password -- <username>
import 'dotenv/config';
import readline from 'node:readline';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { createAdapter } from '../src/prisma/adapter.js';
import { hashPassword } from '../src/auth/password.js';

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s) => { if (s.startsWith(question)) process.stdout.write(question); };
    rl.question(question, (a) => { rl.close(); process.stdout.write('\n'); resolve(a); });
  });
}

const prisma = new PrismaClient({ adapter: createAdapter() });
async function main() {
  const username = process.argv[2];
  if (!username) throw new Error('Pakai: npm run user:password -- <username>');
  const user = await prisma.user.findFirst({ where: { username }, include: { role: true } });
  if (!user) throw new Error(`User ${username} tidak ditemukan.`);
  const password = process.env.USER_PASSWORD ?? (await askHidden(`Password baru untuk ${username}: `));
  if (password.length < 6) throw new Error('Password minimal 6 karakter.');
  await prisma.user.update({ where: { id: user.id }, data: { ...(await hashPassword(password)), isActive: true } });
  console.log(`Password ${username} (role ${user.role.name}) sudah diatur; user diaktifkan.`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
