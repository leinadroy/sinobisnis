import path from "node:path";
import type { NextConfig } from "next";

// Akar monorepo: dibutuhkan agar Turbopack bisa membaca packages/shared (di luar apps/web).
const monorepoRoot = path.resolve(process.cwd(), "../..");

const nextConfig: NextConfig = {
  // Semua halaman aplikasi ini per-user (butuh sesi login), jadi render dinamis biasa;
  // cacheComponents/partial prefetching dimatikan agar pembacaan sesi tidak perlu dibungkus Suspense di tiap halaman.
  cacheComponents: false,
  transpilePackages: ["@sml/shared"],
  // Chrome headless untuk PDF invoice (lib/invoice-pdf.ts) dijalankan dari node_modules, tidak di-bundle.
  serverExternalPackages: ["puppeteer-core"],
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
