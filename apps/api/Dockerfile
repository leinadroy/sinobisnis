# API Sinobisnis (NestJS + Prisma). Build dari root repo:  docker compose build api
# Konfigurasi (.env) TIDAK ada di image; di-mount saat jalan (lihat docker-compose.yml).
FROM node:22-bookworm-slim AS build
WORKDIR /app
# Lockfile dibuat dengan npm legacy-peer-deps=true (setelan npm di laptop dev); disamakan agar npm ci cocok.
ENV npm_config_legacy_peer_deps=true

# packages/shared dulu (dipakai lewat "file:../../packages/shared")
COPY packages/shared/package.json packages/shared/package-lock.json packages/shared/
RUN npm ci --prefix packages/shared --no-audit --no-fund
COPY packages/shared packages/shared
RUN npm run build --prefix packages/shared

COPY apps/api/package.json apps/api/package-lock.json apps/api/
RUN npm ci --prefix apps/api --no-audit --no-fund
COPY apps/api apps/api
# prebuild = prisma generate (tidak konek ke database; URL dummy hanya agar config terbaca)
RUN DATABASE_URL="mysql://build:build@localhost:3306/build" npm run build --prefix apps/api

FROM node:22-bookworm-slim
ENV NODE_ENV=production TZ=Asia/Jakarta PORT=4000 HOST=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends tzdata ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Lockfile dibuat dengan npm legacy-peer-deps=true (setelan npm di laptop dev); disamakan agar npm ci cocok.
ENV npm_config_legacy_peer_deps=true
COPY --from=build --chown=node:node /app/packages/shared/package.json packages/shared/package.json
COPY --from=build --chown=node:node /app/packages/shared/dist packages/shared/dist
# Seluruh apps/api ikut (termasuk devDependencies) supaya `npm run user:password` tetap bisa dipakai di container.
COPY --from=build --chown=node:node /app/apps/api apps/api
# Profil database aktif disimpan di config/ (volume) — harus bisa ditulis user node.
RUN mkdir -p apps/api/config && chown -R node:node apps/api/config
USER node
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
