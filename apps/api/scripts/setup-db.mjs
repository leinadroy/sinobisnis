// Buat role & database PostgreSQL untuk aplikasi, lalu tulis DATABASE_URL ke apps/api/.env.
// Dipakai bila psql tidak tersedia. Password diketik tersembunyi dan tidak dicetak.
// Jalankan dari apps/api:  node scripts/setup-db.mjs
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const APP_USER = process.env.APP_DB_USER || 'sinobisnis_app';
const APP_DB = process.env.APP_DB_NAME || 'sinobisnis_app';
const HOST = process.env.PGHOST || 'localhost';
const PORT = Number(process.env.PGPORT || 5432);
const envFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.startsWith(question)) rl.output.write(question); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

async function main() {
  console.log(`Setup database aplikasi: role "${APP_USER}", database "${APP_DB}" di ${HOST}:${PORT}`);
  // Mode non-interaktif: PG_SUPER_PASSWORD dari env; password user aplikasi dibuat acak bila tidak diberikan.
  const superPass = process.env.PG_SUPER_PASSWORD ?? (await askHidden('Password user "postgres": '));
  let appPass = process.env.APP_DB_PASSWORD;
  if (!appPass && process.env.PG_SUPER_PASSWORD) {
    appPass = (await import('node:crypto')).randomBytes(24).toString('base64url');
    console.log(`Password ${APP_USER} dibuat acak dan langsung ditulis ke .env (tidak ditampilkan).`);
  }
  if (!appPass) {
    appPass = await askHidden(`Password baru untuk "${APP_USER}" (min 8 karakter): `);
    while (appPass.length < 8) appPass = await askHidden('Terlalu pendek, ulangi (min 8 karakter): ');
    const again = await askHidden('Ulangi password tersebut: ');
    if (again !== appPass) throw new Error('Password tidak sama. Jalankan ulang script.');
  }

  const admin = new pg.Client({ host: HOST, port: PORT, user: 'postgres', password: superPass, database: 'postgres' });
  await admin.connect();
  const role = admin.escapeIdentifier(APP_USER);
  const pass = admin.escapeLiteral(appPass);
  const roleExists = (await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [APP_USER])).rowCount > 0;
  await admin.query(roleExists ? `ALTER ROLE ${role} WITH LOGIN PASSWORD ${pass}` : `CREATE ROLE ${role} WITH LOGIN PASSWORD ${pass}`);
  console.log(roleExists ? `Role ${APP_USER} sudah ada — password diperbarui.` : `Role ${APP_USER} dibuat.`);
  const dbExists = (await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [APP_DB])).rowCount > 0;
  if (!dbExists) {
    await admin.query(`CREATE DATABASE ${admin.escapeIdentifier(APP_DB)} OWNER ${role}`);
    console.log(`Database ${APP_DB} dibuat.`);
  } else {
    console.log(`Database ${APP_DB} sudah ada.`);
  }
  await admin.end();

  // Uji login dengan user aplikasi sebelum menulis .env.
  const test = new pg.Client({ host: HOST, port: PORT, user: APP_USER, password: appPass, database: APP_DB });
  await test.connect();
  await test.end();

  const url = `postgresql://${encodeURIComponent(APP_USER)}:${encodeURIComponent(appPass)}@${HOST}:${PORT}/${APP_DB}?schema=public`;
  let env = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
  env = /^DATABASE_URL=.*$/m.test(env) ? env.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL="${url}"`) : `DATABASE_URL="${url}"\n${env}`;
  fs.writeFileSync(envFile, env);
  console.log('Login user aplikasi berhasil. DATABASE_URL di apps/api/.env sudah diperbarui.');
}

main().catch((e) => {
  console.error('GAGAL:', e.message);
  process.exitCode = 1;
});
