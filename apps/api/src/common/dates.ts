/** Kolom @db.Date ↔ 'YYYY-MM-DD' (disimpan UTC tengah malam, jadi tidak bergeser zona waktu). */
export const d2s = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
export const s2d = (s: string | null | undefined) => (s ? new Date(s + 'T00:00:00Z') : null);
