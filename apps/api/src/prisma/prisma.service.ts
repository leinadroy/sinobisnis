import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { DbTestResult } from '@sml/shared';
import { PrismaClient } from '../generated/prisma/client.js';
import { createAdapter } from './adapter.js';
import { EXPECTED_TABLES, loadProfiles, resolveActive, writeState, type DbProfile } from '../database/db-profiles.js';

type SwitchListener = (profile: DbProfile) => unknown;

const clientFor = (p: DbProfile) => new PrismaClient({ adapter: createAdapter(p.url, { readOnly: p.readOnly }) });

// Field internal diawali __ supaya tidak bentrok dengan nama model Prisma (mis. prisma.client = tabel client).
// Semua method PrismaClient (prisma.user, $transaction, $queryRaw, …) diteruskan ke klien aktif lewat Proxy.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface PrismaService extends PrismaClient {}

/**
 * PrismaClient yang bisa dipindah ke profil database lain saat aplikasi berjalan (Developer Menu → Database).
 * Service lain tetap memakai `this.prisma.x` seperti biasa; setelah pindah, panggilan berikutnya otomatis ke database baru.
 * Profil hanya-baca: koneksi dikunci READ ONLY oleh MariaDB, dan login/hak akses (`authDb`) dibaca dari profil tulis.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly __logger = new Logger('Database');
  private __client: PrismaClient;
  private __profile: DbProfile;
  private __auth: { client: PrismaClient; profile: DbProfile } | null = null;
  private readonly __listeners: SwitchListener[] = [];
  private __switching = false;

  constructor() {
    const profiles = loadProfiles();
    this.__profile = resolveActive(profiles);
    this.__client = clientFor(this.__profile);
    this.__auth = this.__authFor(this.__profile, profiles);
    this.__logger.log(`Profil database aktif: ${this.__profile.key} (${this.__profile.label})${this.__profile.readOnly ? ' — HANYA BACA' : ''}`);
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (prop in target) return Reflect.get(target, prop, receiver);
        const value = (target.__client as unknown as Record<string | symbol, unknown>)[prop];
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target.__client) : value;
      },
    });
  }

  private __authFor(profile: DbProfile, profiles: DbProfile[]) {
    if (!profile.readOnly) return null;
    const auth = profiles.find((p) => p.key === profile.authKey && p.url && !p.readOnly);
    if (!auth) throw new Error(`Profil hanya-baca ${profile.key} butuh profil login (DB_AUTH_${profile.key.toUpperCase()}) yang bisa ditulis.`);
    return { client: clientFor(auth), profile: auth };
  }

  get activeProfile(): DbProfile {
    return this.__profile;
  }

  /** Database untuk login, user, role & hak akses: database aktif, atau profil login bila database aktif hanya-baca. */
  get authDb(): PrismaClient {
    return this.__auth?.client ?? this.__client;
  }

  get authProfile(): DbProfile {
    return this.__auth?.profile ?? this.__profile;
  }

  /** Dipanggil setelah pindah database (mis. muat ulang jadwal reminder, sinkron menuitem). */
  onSwitch(fn: SwitchListener) {
    this.__listeners.push(fn);
  }

  /** Coba koneksi ke profil tanpa mengubah database aktif (hanya SELECT). */
  async test(profile: DbProfile): Promise<DbTestResult> {
    const start = Date.now();
    const base: DbTestResult = {
      key: profile.key, ok: false, ms: 0, version: null, database: null, tablesFound: 0, tablesExpected: EXPECTED_TABLES.length,
      missingTables: [], users: null, invoices: null, readOnlySession: null, error: null,
    };
    if (!profile.url) return { ...base, error: 'URL profil ini belum diisi di .env server.' };
    const probe = clientFor(profile);
    try {
      const run = async () => {
        const [base] = await probe.$queryRaw<{ v: string; d: string | null }[]>`SELECT VERSION() AS v, DATABASE() AS d`;
        // MariaDB 10.4: tx_read_only; MySQL 8: transaction_read_only (tx_read_only sudah dihapus).
        const [ro] = /mariadb/i.test(base.v)
          ? await probe.$queryRaw<{ ro: number | bigint }[]>`SELECT @@SESSION.tx_read_only AS ro`
          : await probe.$queryRaw<{ ro: number | bigint }[]>`SELECT @@SESSION.transaction_read_only AS ro`;
        const info = { ...base, ro: ro.ro };
        const tables = await probe.$queryRaw<{ t: string }[]>`SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`;
        const have = new Set(tables.map((r) => r.t.toLowerCase()));
        const missing = EXPECTED_TABLES.filter((t) => !have.has(t));
        const counts = missing.includes('users') || missing.includes('invoice') ? null
          : (await probe.$queryRaw<{ u: bigint; i: bigint }[]>`SELECT (SELECT COUNT(*) FROM users) AS u, (SELECT COUNT(*) FROM invoice) AS i`)[0];
        return { info, missing, counts };
      };
      const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Tidak ada jawaban dalam 10 detik (cek VPN / alamat server).')), 10_000));
      const { info, missing, counts } = await Promise.race([run(), timeout]);
      const readOnlySession = Number(info.ro) === 1;
      const roBroken = profile.readOnly && !readOnlySession;
      return {
        ...base, ok: missing.length === 0 && !roBroken, ms: Date.now() - start, version: info.v, database: info.d,
        tablesFound: EXPECTED_TABLES.length - missing.length, missingTables: missing,
        users: counts ? Number(counts.u) : null, invoices: counts ? Number(counts.i) : null, readOnlySession,
        error: roBroken ? 'Sesi tidak terkunci READ ONLY; profil hanya-baca tidak dipakai.'
          : missing.length ? `Struktur tidak cocok: ${missing.length} tabel aplikasi tidak ada.` : null,
      };
    } catch (e) {
      return { ...base, ms: Date.now() - start, error: e instanceof Error ? e.message.split('\n')[0].slice(0, 300) : String(e) };
    } finally {
      await probe.$disconnect().catch(() => undefined);
    }
  }

  /** Pindah ke profil lain. Gagal bila koneksi / struktur tidak cocok; database aktif tidak berubah. */
  async switchTo(profile: DbProfile, by: string): Promise<DbTestResult> {
    if (this.__switching) throw new Error('Sedang pindah database, coba lagi sebentar.');
    this.__switching = true;
    try {
      const check = await this.test(profile);
      if (!check.ok) return check;
      const auth = this.__authFor(profile, loadProfiles());
      // Profil hanya-baca memakai database lain untuk login; pastikan itu juga hidup, kalau tidak semua user tidak bisa login lagi.
      if (auth) {
        const authCheck = await this.test(auth.profile);
        if (!authCheck.ok) {
          return { ...check, ok: false, error: `Database login (${auth.profile.key}) tidak bisa dipakai: ${authCheck.error ?? 'koneksi gagal'}` };
        }
      }
      const next = clientFor(profile);
      await next.$connect();
      const old = [this.__client, this.__auth?.client].filter((c): c is PrismaClient => Boolean(c));
      const from = this.__profile.key;
      this.__client = next;
      this.__profile = profile;
      this.__auth = auth;
      writeState({ active: profile.key, at: new Date().toISOString(), by, from });
      this.__logger.warn(`Database dipindah dari ${from} ke ${profile.key}${profile.readOnly ? ' (hanya baca)' : ''} oleh ${by}`);
      // Beri waktu request yang sedang berjalan selesai di klien lama sebelum ditutup.
      setTimeout(() => { for (const c of old) void c.$disconnect().catch(() => undefined); }, 30_000).unref();
      for (const fn of this.__listeners) {
        try {
          await fn(profile);
        } catch (e) {
          this.__logger.error(`Tugas setelah pindah database gagal: ${e instanceof Error ? e.message : e}`);
        }
      }
      return check;
    } finally {
      this.__switching = false;
    }
  }

  async onModuleDestroy() {
    await Promise.all([this.__client.$disconnect(), this.__auth?.client.$disconnect()]);
  }
}
