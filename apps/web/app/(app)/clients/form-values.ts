import { CLIENT_DATE_FIELDS, CLIENT_TEXT_FIELDS, type ClientDetail } from "@sml/shared";
import type { ClientFormValues } from "./schema";

const today = () => new Date().toISOString().slice(0, 10);

/** Data API → nilai form (semua string). Tanpa data = form kosong dengan tanggal permohonan hari ini. */
export function toFormValues(c: Partial<ClientDetail> | null): ClientFormValues {
  const v = {} as ClientFormValues;
  for (const f of [...CLIENT_DATE_FIELDS, ...CLIENT_TEXT_FIELDS]) v[f] = ((c as Record<string, unknown> | null)?.[f] as string | null) ?? "";
  v.sponsorId = c?.sponsorId ? String(c.sponsorId) : "";
  v.projectId = c?.projectId ? String(c.projectId) : "";
  v.keperluanId = c?.keperluanId ? String(c.keperluanId) : "";
  v.isArchived = Boolean(c?.isArchived);
  if (!c?.id) v.tanggalPermohonan ||= today();
  return v;
}
