const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** 'YYYY-MM-DD' atau ISO → '19 Okt 2026'. */
export function fmtDate(s: string | null | undefined): string {
  if (!s) return "";
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return s;
  return `${String(d).padStart(2, "0")} ${BULAN[m - 1]} ${y}`;
}

/** ISO datetime → '19 Okt 2026 14.05' (zona waktu browser/server). */
export function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "";
  return new Date(s).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export function fmtMoney(n: number | null | undefined): string {
  return Number(n ?? 0).toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

export function fmtSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
