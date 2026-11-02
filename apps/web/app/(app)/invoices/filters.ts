/** Filter tambahan Invoice List di URL (dipakai halaman server dan panel filter). */
export const INVOICE_FILTER_KEYS = ["status", "from", "to", "sponsorId", "billToId"] as const;
export type InvoiceFilterKey = (typeof INVOICE_FILTER_KEYS)[number];

/** Filter daftar client di Create Invoice. */
export const CREATE_FILTER_KEYS = ["sponsorId", "projectId", "billToId", "search"] as const;
export type CreateFilterKey = (typeof CREATE_FILTER_KEYS)[number];
