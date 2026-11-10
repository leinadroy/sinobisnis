// Profil koneksi database (Developer Menu → Database). Isi koneksi ada di .env server; aplikasi hanya memilih profil.

export type DbTone = 'local' | 'staging' | 'production';

/** Database aktif, ditampilkan sebagai label di header untuk semua user. */
export interface DbActive {
  key: string;
  label: string;
  tone: DbTone;
  host: string | null;
  database: string | null;
  /** Hanya baca: semua perubahan ditolak (koneksi MariaDB READ ONLY). */
  readOnly: boolean;
  /** Pengecualian hanya-baca: tabel users (tambah/edit user, password) boleh ditulis; login dari database ini sendiri. */
  usersWritable: boolean;
}

export interface DbProfileRow extends DbActive {
  port: number | null;
  user: string | null;
  /** URL sudah diisi di .env. */
  configured: boolean;
  active: boolean;
  /** Butuh konfirmasi ketik nama profil saat dipilih (production). */
  danger: boolean;
  /** Menu baru (menuitem 38–42) ditambahkan otomatis ke database ini. */
  menuSync: boolean;
  /** Profil hanya-baca: login & hak akses diambil dari profil ini. */
  authKey: string | null;
  authLabel: string | null;
}

export interface DbProfilesResponse {
  profiles: DbProfileRow[];
  lastChange: { at: string; by: string; from: string | null; to: string } | null;
  /** Lokasi file yang menyimpan profil aktif (di server). */
  stateFile: string;
}

export interface DbTestResult {
  key: string;
  ok: boolean;
  ms: number;
  version: string | null;
  database: string | null;
  /** Tabel aplikasi yang ditemukan / diharapkan (struktur production sinobisnis). */
  tablesFound: number;
  tablesExpected: number;
  missingTables: string[];
  users: number | null;
  invoices: number | null;
  /** Sesi MariaDB benar-benar READ ONLY (@@tx_read_only) — untuk profil hanya-baca. */
  readOnlySession: boolean | null;
  error: string | null;
}

export const DB_TONE_LABEL: Record<DbTone, string> = { local: 'Lokal', staging: 'Staging', production: 'Production' };
