# Web Sinobisnis (Next.js) + Chromium untuk PDF invoice. Build dari root repo:  docker compose build web
FROM node:22-bookworm-slim AS build
WORKDIR /app
# Lockfile dibuat dengan npm legacy-peer-deps=true (setelan npm di laptop dev); disamakan agar npm ci cocok.
ENV npm_config_legacy_peer_deps=true
ENV NEXT_TELEMETRY_DISABLED=1

COPY packages/shared/package.json packages/shared/package-lock.json packages/shared/
RUN npm ci --prefix packages/shared --no-audit --no-fund
COPY packages/shared packages/shared
RUN npm run build --prefix packages/shared

COPY apps/web/package.json apps/web/package-lock.json apps/web/
RUN npm ci --prefix apps/web --no-audit --no-fund
COPY apps/web apps/web
# devDependencies tidak di-prune: `next start` memuat next.config.ts dan butuh paket TypeScript.
RUN npm run build --prefix apps/web

FROM node:22-bookworm-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 TZ=Asia/Jakarta PORT=3001 \
    PDF_BROWSER_PATH=/usr/bin/chromium PDF_RENDER_ORIGIN=http://127.0.0.1:3001
# Chromium = mesin PDF (puppeteer-core). fonts-liberation: pengganti Arial/Arial Narrow dengan ukuran huruf yang sama.
# Font Windows (Arial, Impact) bisa ditambahkan lewat volume /usr/share/fonts/truetype/custom (lihat docs/deploy-docker.md).
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium fonts-liberation fonts-dejavu-core fontconfig tzdata ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Lockfile dibuat dengan npm legacy-peer-deps=true (setelan npm di laptop dev); disamakan agar npm ci cocok.
ENV npm_config_legacy_peer_deps=true
COPY --from=build --chown=node:node /app/packages/shared/package.json packages/shared/package.json
COPY --from=build --chown=node:node /app/packages/shared/dist packages/shared/dist
COPY --from=build --chown=node:node /app/apps/web/package.json apps/web/package.json
COPY --from=build --chown=node:node /app/apps/web/next.config.ts apps/web/next.config.ts
COPY --from=build --chown=node:node /app/apps/web/public apps/web/public
COPY --from=build --chown=node:node /app/apps/web/.next apps/web/.next
COPY --from=build --chown=node:node /app/apps/web/node_modules apps/web/node_modules
USER node
WORKDIR /app/apps/web
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "fc-cache -f >/dev/null 2>&1; exec node node_modules/next/dist/bin/next start -p ${PORT} -H 0.0.0.0"]
