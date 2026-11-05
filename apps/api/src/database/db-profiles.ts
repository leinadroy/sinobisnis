import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import type { DbActive, DbTone } from '@sml/shared';

/**
 * Profil koneksi database dari .env (tidak pernah dari browser):
 *   DB_PROFILES=local,staging,production        urutan & nama profil
 *   DB_URL_LOCAL=mysql://user:pass@host:3306/db  URL tiap profil (kosong = belum dikonfigurasi)
 *                                               boleh memakai ${DATABASE_URL} supaya password tidak ditulis ulang
 *   DB_DATABASE_LOCAL=sinobisnis_test            opsional: ganti nama database di URL
 *   DB_LABEL_LOCAL=Lokal laptop                  opsional
 *   DB_TONE_LOCAL=local|staging|production       opsional; default dari nama profil
 *   DB_MENU_SYNC_LOCAL=1|0                       tambah menuitem 38–42 otomatis (default 1, production / hanya-baca 0)
 *   DB_READONLY_LOCAL=1|0                        hanya baca: koneksi dikunci READ ONLY + semua perubahan ditolak API
 *                                               (default 1 untuk production)
 *   DB_AUTH_LOCAL=local                          profil hanya-baca: login & hak akses dibaca dari profil ini
 *                                               (default DB_PROFILE_DEFAULT / profil tulis pertama)
 *   DB_ENV_FILE=../../.env                       file .env tambahan yang hanya dipakai untuk ${...} (mis. DB_PASS
 *                                               production di .env root, tanpa menyalin passwordnya); ${VAR:url} = di-encode
 *   DB_PROFILE_DEFAULT=local                     profil awal bila belum pernah dipilih
 * Tanpa DB_PROFILES dipakai satu profil "default" dari DATABASE_URL (perilaku lama).
 * Profil aktif disimpan di file (DB_PROFILE_FILE, default config/db-profile.json) — bukan di database,
 * karena login sendiri butuh database.
 */
export interface DbProfile {
  key: string;
  label: string;
  url: string;
  tone: DbTone;
  danger: boolean;
  menuSync: boolean;
  /** Hanya baca: sesi MariaDB READ ONLY dan API menolak semua perubahan. */
  readOnly: boolean;
  /** Profil hanya-baca: profil asal data login/hak akses (null = profil ini sendiri). */
  authKey: string | null;
}

/** Isi file .env tambahan (hanya untuk ${...}; tidak dimasukkan ke process.env). */
function extraEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const file = env.DB_ENV_FILE?.trim();
  if (!file) return {};
  try {
    const out: Record<string, string> = {};
    for (const line of readFileSync(path.resolve(file), 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * `${DATABASE_URL}` di nilai DB_URL_<PROFIL> diganti nilai variabel itu (supaya password tidak perlu ditulis dua kali);
 * `${DB_PASS:url}` = nilai yang di-encode untuk URL. Variabel dicari di process.env lalu di DB_ENV_FILE.
 */
const expand = (v: string, env: NodeJS.ProcessEnv, extra: Record<string, string>) =>
  v.replace(/\$\{([A-Za-z0-9_]+)(:url)?\}/g, (_, name: string, enc?: string) => {
    const val = env[name] ?? extra[name] ?? '';
    return enc ? encodeURIComponent(val) : val;
  });

/** DB_DATABASE_<PROFIL> mengganti nama database di URL (server & user sama, database lain). */
function withDatabase(url: string, database: string | undefined) {
  if (!url || !database) return url;
  try {
    const u = new URL(url);
    u.pathname = `/${encodeURIComponent(database)}`;
    return u.toString();
  } catch {
    return url;
  }
}

const envKey = (key: string) => key.toUpperCase().replace(/[^A-Z0-9]/g, '_');
const toneOf = (key: string): DbTone => (/prod/i.test(key) ? 'production' : /stag|test|uat/i.test(key) ? 'staging' : 'local');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function loadProfiles(env: NodeJS.ProcessEnv = process.env): DbProfile[] {
  const keys = (env.DB_PROFILES ?? '').split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
  if (!keys.length) {
    return [{ key: 'default', label: 'Default (DATABASE_URL)', url: env.DATABASE_URL ?? '', tone: 'local', danger: false, menuSync: true, readOnly: false, authKey: null }];
  }
  const extra = extraEnv(env);
  const list = [...new Set(keys)].map((key) => {
    const K = envKey(key);
    const t = env[`DB_TONE_${K}`]?.trim().toLowerCase();
    const tone: DbTone = t === 'production' || t === 'staging' || t === 'local' ? t : toneOf(key);
    const sync = env[`DB_MENU_SYNC_${K}`]?.trim();
    const ro = env[`DB_READONLY_${K}`]?.trim();
    const readOnly = ro === undefined || ro === '' ? tone === 'production' : ro === '1';
    const p: DbProfile = {
      key,
      label: env[`DB_LABEL_${K}`]?.trim() || cap(key),
      url: withDatabase(expand(env[`DB_URL_${K}`]?.trim() ?? '', env, extra), env[`DB_DATABASE_${K}`]?.trim()),
      tone,
      // Production yang bisa ditulis wajib konfirmasi; versi hanya-baca aman dibuka.
      danger: tone === 'production' && !readOnly,
      menuSync: readOnly ? false : sync === undefined || sync === '' ? tone !== 'production' : sync === '1',
      readOnly,
      authKey: null,
    };
    return p;
  });
  // Profil hanya-baca memakai login/hak akses dari profil tulis (password di database hanya-baca tidak bisa diatur).
  const writable = list.filter((p) => !p.readOnly && p.url);
  const fallback = writable.find((p) => p.key === env.DB_PROFILE_DEFAULT?.trim().toLowerCase()) ?? writable[0];
  for (const p of list) {
    if (!p.readOnly) continue;
    const want = env[`DB_AUTH_${envKey(p.key)}`]?.trim().toLowerCase();
    p.authKey = (writable.find((w) => w.key === want) ?? fallback)?.key ?? null;
  }
  return list;
}

/** Bagian URL yang aman ditampilkan (tanpa password). */
export function describeUrl(url: string): { host: string | null; port: number | null; database: string | null; user: string | null } {
  try {
    const u = new URL(url.replace(/^mysql:/, 'mariadb:'));
    return { host: u.hostname || null, port: u.port ? Number(u.port) : 3306, database: decodeURIComponent(u.pathname.replace(/^\//, '')) || null, user: decodeURIComponent(u.username) || null };
  } catch {
    return { host: null, port: null, database: null, user: null };
  }
}

export const toActive = (p: DbProfile): DbActive => {
  const d = describeUrl(p.url);
  return { key: p.key, label: p.label, tone: p.tone, host: d.host, database: d.database, readOnly: p.readOnly };
};

export interface DbState {
  active: string;
  at: string;
  by: string;
  from: string | null;
}

export const stateFile = (env: NodeJS.ProcessEnv = process.env) => path.resolve(env.DB_PROFILE_FILE?.trim() || path.join(process.cwd(), 'config', 'db-profile.json'));

export function readState(env: NodeJS.ProcessEnv = process.env): DbState | null {
  try {
    const f = stateFile(env);
    return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as DbState) : null;
  } catch {
    return null;
  }
}

export function writeState(state: DbState, env: NodeJS.ProcessEnv = process.env) {
  const f = stateFile(env);
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(state, null, 2));
  appendFileSync(path.join(path.dirname(f), 'db-switch.log'), `${state.at}\t${state.by}\t${state.from ?? '-'} -> ${state.active}\n`);
}

/** Profil aktif: pilihan terakhir (bila masih terkonfigurasi) → DB_PROFILE_DEFAULT → profil terkonfigurasi pertama. */
export function resolveActive(profiles: DbProfile[], env: NodeJS.ProcessEnv = process.env): DbProfile {
  const ok = profiles.filter((p) => p.url);
  if (!ok.length) throw new Error('Belum ada URL database. Isi DATABASE_URL atau DB_PROFILES + DB_URL_<PROFIL> di apps/api/.env.');
  const pick = (k?: string | null) => (k ? ok.find((p) => p.key === k.trim().toLowerCase()) : undefined);
  return pick(readState(env)?.active) ?? pick(env.DB_PROFILE_DEFAULT) ?? ok[0];
}

/** Tabel aplikasi (= @@map di prisma/schema.prisma, struktur production sinobisnis). */
export const EXPECTED_TABLES = [
  'users', 'role', 'rolepgmname', 'menuitem', 'usercookies', 'sponsor', 'sponsorproject', 'billto', 'keperluan', 'bankaccount',
  'company', 'tax', 'client', 'attachment', 'conversation', 'datalog', 'notification', 'invoice', 'invoicedetail', 'invoicetax',
  'invoiceattachment', 'updaterequest', 'printqueue', 'kontrak', 'kontrakdetail', 'emailtemplate', 'emailrecipient',
  'systemconfigurator', 'systemmessages', 'action',
];
