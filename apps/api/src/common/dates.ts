/** Kolom @db.Date ↔ 'YYYY-MM-DD' (disimpan UTC tengah malam, jadi tidak bergeser zona waktu). */
export const d2s = (d: Date | null | undefined) => (d && d.getUTCFullYear() >= 1900 ? d.toISOString().slice(0, 10) : null);
export const s2d = (s: string | null | undefined) => (s ? new Date(s + 'T00:00:00Z') : null);

/** Tanggal "kosong" versi GeneXus (database lama memakai 1000-01-01, bukan NULL). */
export const GX_EMPTY_DATE = new Date('1000-01-01T00:00:00Z');
/** 'YYYY-MM-DD' / null → Date untuk kolom NOT NULL bergaya GeneXus. */
export const s2gx = (s: string | null | undefined) => s2d(s) ?? GX_EMPTY_DATE;
/**
 * Datetime → ISO; kosong / 1000-01-01 → null. Kolom DATETIME berisi UTC (aplikasi lama juga menyimpan UTC: aktivitas
 * staf tercatat 01:00–15:00 dengan jeda 05:00 = istirahat 12:00 WIB), sama dengan cara adapter MariaDB membaca/menulis.
 */
export const dt2s = (d: Date | null | undefined) => (d && d.getUTCFullYear() >= 1900 ? d.toISOString() : null);
