# Deploy aplikasi Sinobisnis dengan Docker (server Linux)

Alternatif untuk `docs/deploy-windows.md`. Dua container: **web** (Next.js + Chromium untuk PDF) dan **api** (NestJS).
Database tidak ikut di Docker: API konek ke server database yang sudah ada.

```
Browser ──HTTPS──> Nginx/Caddy (443) ──> web :3001 ──(jaringan Docker)──> api :4000 ──> MariaDB/MySQL
                                         Chromium (PDF)                          10.10.3.62 staging / 10.10.3.23 production
```

File:

| File | Isi |
|---|---|
| `docker-compose.yml` | dua service, volume `api-config` (profil database aktif), port web |
| `apps/api/Dockerfile`, `apps/web/Dockerfile` | build dari root repo (`packages/shared` ikut di-build) |
| `.dockerignore` | `.env`, data pribadi, `node_modules`, app Python tidak masuk image |
| `docker/.env.example` | variabel compose (`PUBLIC_URL`, `COOKIE_SECURE`, `WEB_BIND`, `WEB_PORT`) |
| `docker/fonts/` | opsional: font Arial/Impact dari Windows untuk PDF yang persis sama |

Rahasia **tidak** dimasukkan ke image. `apps/api/.env` dan root `.env` di server di-mount read-only ke container.

## 1. Siapkan server

Ubuntu 22.04/24.04 atau Debian 12, minimal 2 vCPU, 4 GB RAM, disk 20 GB.

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # logout/login sekali
docker compose version
```

Server harus bisa menjangkau database: `nc -vz 10.10.3.62 3306`. Production 10.10.3.23 butuh jaringan kantor/VPN.

## 2. Ambil kode

```bash
git clone https://github.com/leinadroy/sinobisnis.git /opt/sinobisnis
cd /opt/sinobisnis
```

## 3. Konfigurasi (di server, tidak di-commit)

**Root `.env`.** Isi kredensial database yang dirujuk profil, ditambah variabel compose dari `docker/.env.example`:

```ini
STAGING_DB_HOST=10.10.3.62
STAGING_DB_PORT=3306
STAGING_DB_USER=...
STAGING_DB_PASS=...
STAGING_DB_NAME=sinobisnis_staging
# production (read-only), bila profil production dipakai
DB_HOST=10.10.3.23
DB_PORT=3306
DB_USER=...
DB_PASS=...
DB_NAME=sinobisnis

PUBLIC_URL=https://sinobisnis.contoh.com
COOKIE_SECURE=1
WEB_BIND=127.0.0.1
WEB_PORT=3001
```

> Kalau password mengandung `$`, tulis `$$` atau beri tanda kutip tunggal. Compose juga membaca file ini dan
> menganggap `$` sebagai variabel.

**`apps/api/.env`.** Salin dari `apps/api/.env.example`. Bagian penting:

```ini
JWT_SECRET=<string acak panjang, mis. hasil: openssl rand -hex 48>
JWT_EXPIRES_IN=12h
# Ditulis langsung (password di-URL-encode). Dipakai script set password & Prisma CLI, yang tidak mengenal ${...}.
DATABASE_URL=mysql://USER:PASSWORD@10.10.3.62:3306/sinobisnis_staging

DB_ENV_FILE=../../.env
DB_PROFILES=staging,production
DB_LABEL_STAGING=Staging (server 10.10.3.62)
DB_URL_STAGING=mysql://${STAGING_DB_USER:url}:${STAGING_DB_PASS:url}@${STAGING_DB_HOST}:${STAGING_DB_PORT}/${STAGING_DB_NAME}
DB_LABEL_PRODUCTION=Production
DB_URL_PRODUCTION=mysql://${DB_USER:url}:${DB_PASS:url}@${DB_HOST}:${DB_PORT}/${DB_NAME}
DB_READONLY_PRODUCTION=1
DB_AUTH_PRODUCTION=staging
DB_PROFILE_DEFAULT=staging
```

- `HOST`, `PORT` dan `WEB_ORIGIN` diatur oleh compose, jadi tidak perlu ditulis di sini.
- Profil `production` tetap **hanya baca**. Login dan hak aksesnya dibaca dari profil yang bisa ditulis (`DB_AUTH_PRODUCTION`,
  di contoh ini staging), karena laptop `local` tidak ada di server.
- Jangan set `DB_READONLY_PRODUCTION=0` sebelum go-live yang sudah disepakati.
- `DATABASE_URL` dipakai bila `DB_PROFILES` kosong, oleh Prisma CLI, dan oleh `npm run user:password`. Isi dengan
  database yang bisa ditulis (staging), **jangan** production.
- **Email reminder:** biarkan System Configurator → `Reminder Enabled` mati selama aplikasi lama masih mengirim reminder.
  Kalau API dijalankan lebih dari satu instance, tambahkan `REMINDER_SCHEDULER=off` di instance tambahan.

**Font (opsional).** Salin `arial*.ttf`, `ARIALN.TTF`, dan `impact.ttf` dari `C:\Windows\Fonts` ke `docker/fonts/`.

## 4. Build & jalankan

```bash
docker compose up -d --build
docker compose ps            # api & web "healthy"
docker compose logs -f api   # "Profil database aktif: staging ..."
curl -s http://127.0.0.1:3001/login -o /dev/null -w '%{http_code}\n'   # 200
```

Build pertama makan waktu sekitar 5–10 menit.

**Uji coba tanpa domain:** set `WEB_BIND=0.0.0.0` dan `COOKIE_SECURE=0` di root `.env`, lalu jalankan
`docker compose up -d`, dan buka `http://IP-server:3001`. Kembalikan ke nilai semula setelah HTTPS terpasang. Tanpa
`COOKIE_SECURE=0`, login lewat http:// tidak bisa, karena cookie sesi hanya dikirim lewat HTTPS.

## 5. HTTPS (reverse proxy)

Paling ringkas pakai Caddy, yang mengurus sertifikat Let's Encrypt otomatis. Ini butuh domain publik yang mengarah ke
server. `/etc/caddy/Caddyfile`:

```
sinobisnis.contoh.com {
    reverse_proxy 127.0.0.1:3001
    request_body {
        max_size 120MB
    }
}
```

Kalau pakai Nginx: `proxy_pass http://127.0.0.1:3001;`, `client_max_body_size 120m;`, `proxy_read_timeout 300s;`.
Timeout panjang diperlukan karena PDF invoice dengan ratusan lampiran bisa butuh beberapa menit.

## 6. Perintah sehari-hari

| Keperluan | Perintah |
|---|---|
| Update ke versi terbaru | `git pull && docker compose up -d --build` |
| Restart | `docker compose restart` |
| Log | `docker compose logs -f web` / `api` |
| Set password user (bcrypt) | `docker compose exec api npm run user:password -- <username>` |
| Stop | `docker compose down` (profil database aktif tetap tersimpan di volume `api-config`) |
| Bersihkan image lama | `docker image prune -f` |

## Catatan

- Setelah pindah profil database di Developer Menu, semua user harus login ulang (sama seperti di Windows).
- Container `web` memakai Chromium dari Debian (`PDF_BROWSER_PATH=/usr/bin/chromium`) dan `shm_size: 1gb` agar PDF besar
  tidak crash.
- Waktu container `Asia/Jakarta`. Kolom DATETIME tetap disimpan UTC (lihat `CLAUDE.md`).
