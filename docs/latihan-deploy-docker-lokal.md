# Latihan deploy dengan Docker di laptop

Catatan latihan (2026-11-10): deploy aplikasi Sinobisnis ke laptop sendiri memakai Docker Compose, mengikuti
[deploy-docker.md](deploy-docker.md). Bedanya dengan server sungguhan hanya di **port** dan **HTTPS**.

## Gambaran

```
Browser ──http──> localhost:3002 ──> container web (Next.js, port 3001 di dalam)
                                         │  jaringan internal Docker
                                         ▼
                                     container api (NestJS, port 4000, tidak dibuka ke luar)
                                         │
                                         ▼
                                     MariaDB/MySQL staging 10.10.3.62 (di luar Docker)
```

- **Dua image**, dibuat dari `Dockerfile.api` dan `Dockerfile.web` di root repo. `packages/shared` ikut di-build di dalam keduanya.
- **Database tidak ikut di Docker.** API konek ke server staging sesuai `apps/api/.env` (`DB_PROFILE_DEFAULT=staging`).
- **Rahasia tidak masuk image.** `apps/api/.env` dan root `.env` di-mount **read-only** ke container (lihat `volumes` di
  `docker-compose.yml`), dan `.dockerignore` mencegah file `.env` ikut ter-copy saat build.
- **Profil database aktif** (Developer Menu → Database) disimpan di volume `api-config`, jadi tetap ada walau container dibuat ulang.

## Perbedaan dengan dev server

| | Dev (`npm run dev` / `start:dev`) | Deploy (Docker) |
|---|---|---|
| Alamat | http://localhost:3001 (web), :4000 (API) | http://localhost:3002 (web saja) |
| Build | dikompilasi saat jalan, hot reload | `npm run build` sekali di dalam image, lalu `npm start` |
| API | dibuka di port 4000 | hanya di jaringan Docker; browser selalu lewat web |
| Kode berubah | langsung terlihat | perlu build ulang image (`up -d --build`) |
| PDF | Chrome/Edge di Windows | Chromium di dalam container web |

## Langkah

### 1. Nyalakan Docker Desktop

Tunggu sampai `docker info` berhasil (engine "running").

### 2. Variabel compose: `docker/.env` (git-ignored)

```ini
PUBLIC_URL=http://localhost:3002   # alamat yang dibuka di browser (CORS API)
COOKIE_SECURE=0                    # 0 = login boleh lewat http:// (belum ada HTTPS)
WEB_BIND=127.0.0.1                 # hanya dari laptop ini
WEB_PORT=3002                      # 3001/4000 masih dipakai dev server
```

Di server sungguhan, nilai ini ditulis di root `.env`, dengan `PUBLIC_URL=https://domain`, `COOKIE_SECURE=1` dan `WEB_PORT=3001`.

Cek hasil gabungan konfigurasinya tanpa menjalankan apa pun:

```bash
docker compose --env-file docker/.env -p sinobisnis-local config
```

`-p sinobisnis-local` = nama project. Nama ini jadi awalan nama container, jaringan dan volume, supaya tidak tercampur
dengan latihan lain.

### 3. Build & jalankan

```bash
docker compose --env-file docker/.env -p sinobisnis-local up -d --build
```

- `--build` = build ulang image dari kode sekarang. Build pertama butuh 5–10 menit; build berikutnya lebih cepat karena layer di-cache.
- `-d` = jalan di background.
- Container web baru start setelah api **healthy** (`depends_on: condition: service_healthy`).

### 4. Cek

```bash
docker compose -p sinobisnis-local ps          # api & web: Up (healthy)
docker compose -p sinobisnis-local logs api    # "Profil database aktif: staging ..."
```

Lalu buka http://localhost:3002 dan login dengan `admin` (user staging yang sudah berpassword baru).

## Perintah sehari-hari

| Keperluan | Perintah |
|---|---|
| Lihat status | `docker compose -p sinobisnis-local ps` |
| Log (ikuti terus) | `docker compose -p sinobisnis-local logs -f web` / `api` |
| Update setelah kode berubah | `docker compose --env-file docker/.env -p sinobisnis-local up -d --build` |
| Restart | `docker compose -p sinobisnis-local restart` |
| Masuk ke container | `docker compose -p sinobisnis-local exec api sh` |
| Stop (container dihapus, volume tetap) | `docker compose -p sinobisnis-local down` |
| Hapus total termasuk volume profil DB | `docker compose -p sinobisnis-local down -v` |
| Bersihkan image lama | `docker image prune -f` |

## Yang berbeda di server sungguhan

1. Server Linux (Ubuntu/Debian); Docker dipasang dengan `get.docker.com`.
2. Ada reverse proxy dengan HTTPS (Caddy/Nginx) di depan web; `COOKIE_SECURE=1`.
3. `JWT_SECRET` baru yang acak, khusus untuk server itu.
4. `DB_AUTH_PRODUCTION=staging` di server, karena profil `local` (laptop) tidak ada di sana.
