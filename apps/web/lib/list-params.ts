/** Ambil parameter list standar dari searchParams halaman → query string untuk API. */
export function listQuery(sp: Record<string, string | string[] | undefined>, defaults: { pageSize?: number } = {}) {
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const page = Math.max(1, Number(get("page")) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(get("pageSize")) || defaults.pageSize || 25));
  const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  for (const k of ["sort", "order", "search"]) {
    const v = get(k);
    if (v) q.set(k, v);
  }
  return { page, pageSize, qs: q.toString() };
}
