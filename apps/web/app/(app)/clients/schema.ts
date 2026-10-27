import { z } from "zod";

const date = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Format tanggal tidak valid.");
const text = (max = 200) => z.string().max(max, `Maksimal ${max} karakter.`);

/** Semua field form berupa string ('' = kosong); dikonversi ke JSON API di actions.ts. */
export const clientSchema = z.object({
  tanggalPermohonan: date,
  sponsorId: z.string(),
  projectId: z.string(),
  name: z.string().trim().min(1, "Nama Client wajib diisi.").max(200),
  noPaspor: text(50),
  tanggalLahir: date,
  keperluanId: z.string(),
  noRptka: text(100),
  pembayaranPnbp: date,
  permohonanHariKe3: text(100),
  tanggalProsesSelesai: date,
  tanggalTerbitDokumen: date,
  tanggalMasukLastExp: date,
  expiredDokumen: date,
  epo: text(100),
  noInvoice: text(100),
  tanggalInvoice: date,
  tanggalPembayaranInvoice: date,
  prosesPerpanjangan: text(200),
  sktt: text(100),
  stm: text(100),
  status: text(100),
  keteranganTka: text(5000),
  isArchived: z.boolean(),
  archivedReason: text(500),
});

export type ClientFormValues = z.infer<typeof clientSchema>;
