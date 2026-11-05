import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describeUrl, EXPECTED_TABLES, loadProfiles, readState, resolveActive, writeState } from './db-profiles.js';

const tmpEnv = (extra: Record<string, string> = {}) => ({ DB_PROFILE_FILE: path.join(mkdtempSync(path.join(tmpdir(), 'dbp-')), 'state.json'), ...extra });

describe('db-profiles', () => {
  it('tanpa DB_PROFILES memakai DATABASE_URL sebagai profil default', () => {
    const p = loadProfiles({ DATABASE_URL: 'mysql://a:b@localhost:3306/sinobisnis' });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ key: 'default', tone: 'local', danger: false, menuSync: true });
  });

  it('membaca profil, label, tone, dan default menu sync (production mati)', () => {
    const p = loadProfiles({
      DB_PROFILES: 'local, Staging ,production', DB_URL_LOCAL: 'mysql://u:p@localhost/sinobisnis', DB_LABEL_LOCAL: 'Laptop',
      DB_URL_PRODUCTION: 'mysql://u:p@10.10.3.23/sinobisnis',
    });
    expect(p.map((x) => [x.key, x.label, x.tone, x.danger, x.menuSync, x.readOnly, x.authKey, Boolean(x.url)])).toEqual([
      ['local', 'Laptop', 'local', false, true, false, null, true],
      ['staging', 'Staging', 'staging', false, true, false, null, false],
      // production default hanya-baca: tidak perlu konfirmasi, tidak sinkron menu, login dari profil tulis (local)
      ['production', 'Production', 'production', false, false, true, 'local', true],
    ]);
  });

  it('production yang bisa ditulis wajib konfirmasi; hanya-baca tidak pernah sinkron menu', () => {
    const [w] = loadProfiles({ DB_PROFILES: 'production', DB_READONLY_PRODUCTION: '0', DB_URL_PRODUCTION: 'mysql://u@h/db' });
    expect([w.readOnly, w.danger, w.menuSync]).toEqual([false, true, false]);
    const [r] = loadProfiles({ DB_PROFILES: 'production', DB_MENU_SYNC_PRODUCTION: '1' });
    expect([r.readOnly, r.menuSync]).toEqual([true, false]);
    expect(loadProfiles({ DB_PROFILES: 'production,production', DB_READONLY_PRODUCTION: '0', DB_MENU_SYNC_PRODUCTION: '1' })[0].menuSync).toBe(true);
  });

  it('DB_AUTH_<PROFIL> memilih profil login; default DB_PROFILE_DEFAULT', () => {
    const env = { DB_PROFILES: 'a,b,production', DB_URL_A: 'mysql://u@h/a', DB_URL_B: 'mysql://u@h/b', DB_URL_PRODUCTION: 'mysql://u@p/db' };
    expect(loadProfiles(env)[2].authKey).toBe('a');
    expect(loadProfiles({ ...env, DB_PROFILE_DEFAULT: 'b' })[2].authKey).toBe('b');
    expect(loadProfiles({ ...env, DB_AUTH_PRODUCTION: 'b' })[2].authKey).toBe('b');
  });

  it('DB_ENV_FILE + ${VAR:url}: password production dirujuk dari .env lain dan di-encode, tidak masuk process.env', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dbe-'));
    const file = path.join(dir, '.env');
    writeFileSync(file, ['# komentar', 'DB_HOST=10.10.3.23', 'DB_USER=gx', 'DB_PASS="p@ss:w/rd"', 'DB_NAME=sinobisnis', ''].join(String.fromCharCode(13, 10)));
    const env: NodeJS.ProcessEnv = { DB_ENV_FILE: file, DB_PROFILES: 'production', DB_URL_PRODUCTION: 'mysql://${DB_USER:url}:${DB_PASS:url}@${DB_HOST}:3306/${DB_NAME}' };
    const [p] = loadProfiles(env);
    expect(p.url).toBe('mysql://gx:p%40ss%3Aw%2Frd@10.10.3.23:3306/sinobisnis');
    expect(describeUrl(p.url)).toEqual({ host: '10.10.3.23', port: 3306, database: 'sinobisnis', user: 'gx' });
    expect(env.DB_PASS).toBeUndefined();
  });

  it('${VAR} dan DB_DATABASE_<PROFIL>: server sama, database lain, password tidak ditulis ulang', () => {
    const [p] = loadProfiles({ DB_PROFILES: 'staging', DATABASE_URL: 'mysql://roy:p%40ss@localhost:3306/sinobisnis', DB_URL_STAGING: '${DATABASE_URL}', DB_DATABASE_STAGING: 'sinobisnis_test' });
    expect(p.url).toBe('mysql://roy:p%40ss@localhost:3306/sinobisnis_test');
    expect(describeUrl(p.url).database).toBe('sinobisnis_test');
  });

  it('describeUrl tidak pernah membawa password', () => {
    const d = describeUrl('mysql://roy:rahasia%40123@10.10.3.23:3307/sinobisnis');
    expect(d).toEqual({ host: '10.10.3.23', port: 3307, database: 'sinobisnis', user: 'roy' });
    expect(JSON.stringify(d)).not.toContain('rahasia');
    expect(describeUrl('bukan url').host).toBeNull();
  });

  it('profil aktif: pilihan tersimpan → DB_PROFILE_DEFAULT → profil terkonfigurasi pertama', () => {
    const env = tmpEnv({ DB_PROFILES: 'staging,local', DB_URL_LOCAL: 'mysql://u@h/db', DB_URL_STAGING: '' });
    const profiles = loadProfiles(env);
    expect(resolveActive(profiles, env).key).toBe('local'); // staging belum diisi
    writeState({ active: 'staging', at: 'x', by: 'y', from: null }, env);
    expect(resolveActive(profiles, env).key).toBe('local'); // pilihan tersimpan tapi URL kosong → diabaikan
    const env2 = { ...env, DB_URL_STAGING: 'mysql://u@h2/db' };
    expect(resolveActive(loadProfiles(env2), env2).key).toBe('staging');
    expect(readState(env)?.active).toBe('staging');
    expect(readFileSync(path.join(path.dirname(env.DB_PROFILE_FILE), 'db-switch.log'), 'utf8')).toContain('-> staging');
  });

  it('tanpa URL sama sekali memberi pesan jelas', () => {
    expect(() => resolveActive(loadProfiles(tmpEnv({ DB_PROFILES: 'local' })), tmpEnv())).toThrow(/Belum ada URL database/);
  });

  it('EXPECTED_TABLES = semua @@map di prisma/schema.prisma', () => {
    const schema = readFileSync(path.resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
    const mapped = [...schema.matchAll(/@@map\("([a-z]+)"\)/g)].map((m) => m[1]).sort();
    expect([...EXPECTED_TABLES].sort()).toEqual(mapped);
  });
});
