import { listQuery } from "./list-params";

const FILTER_KEYS = ["sponsorId", "keperluanId", "from", "to", "expiring", "uninvoiced", "unpaid"];

/** Query API list client = query standar + filter tambahan dari URL. */
export function clientListQuery(sp: Record<string, string | string[] | undefined>) {
  const base = listQuery(sp, { pageSize: 50 });
  const q = new URLSearchParams(base.qs);
  for (const k of FILTER_KEYS) {
    const v = typeof sp[k] === "string" ? (sp[k] as string) : "";
    if (!v) continue;
    q.set(k, k === "uninvoiced" || k === "unpaid" ? "true" : v);
  }
  return q.toString();
}
