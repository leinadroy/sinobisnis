// Konversi baris tabel invoicedetail (format aplikasi lama) ↔ grup invoice di aplikasi baru. Tanpa akses database
// supaya bisa diuji langsung (invoice-rows.spec.ts). Aturan: docs/invoice-mapping.md.

export interface DetailRow {
  id: bigint | number;
  description: string;
  qty: number | null;
  unitPrice: bigint | number;
  subTotal: bigint | number | null;
  clientNo: bigint | number | null;
  keperluanId: number | null;
}

export interface GroupItem { description: string; keperluanId: number | null; qty: number; unitPrice: number; subTotal: number }
export interface GroupName { clientId: number | null; name: string }
export interface Group { items: GroupItem[]; clients: GroupName[] }

/** Untuk mencocokkan nama: huruf kecil, tanpa tanda baca & spasi ganda. */
export const normName = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** "12. Zhu Yanhua" → "Zhu Yanhua". */
export const stripNo = (s: string) => s.replace(/^\s*\d+\s*[.)]\s*/, '').trim();

/** Baris nama TKA: Qty 0, atau Qty > 0 dengan harga 0 yang bernomor ("12. Zhu Yanhua", data lama). */
export function isNameRow(r: Pick<DetailRow, 'qty' | 'unitPrice' | 'description'>) {
  return !Number(r.qty) || (Number(r.unitPrice) === 0 && /^\s*\d+\s*[.)]\s/.test(r.description));
}

/**
 * Baris (urut InvoiceDetailId) → grup. Baris layanan setelah baris nama memulai grup baru; baris layanan berturut-turut
 * masuk grup yang sama. InvoiceDetailClientNo sering menunjuk client lain, jadi client hanya dikaitkan bila namanya cocok
 * (`clientName(no)` = nama client itu), atau cocok dengan salah satu `candidates` (client ber-No Invoice sama).
 */
export function rowsToGroups(
  rows: DetailRow[],
  clientName: (no: number) => string | undefined,
  candidates: { no: number; name: string }[] = [],
): Group[] {
  const sorted = [...rows].sort((a, b) => Number(a.id) - Number(b.id));
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasName = false;
  for (const r of sorted) {
    const name = isNameRow(r);
    if (!current || (!name && lastWasName)) {
      current = { items: [], clients: [] };
      groups.push(current);
    }
    if (name) {
      const text = stripNo(r.description) || r.description.trim();
      lastWasName = true;
      if (!text) continue;
      const direct = r.clientNo ? Number(r.clientNo) : null;
      let clientId = direct && normName(clientName(direct)) === normName(text) ? direct : candidates.find((c) => normName(c.name) === normName(text))?.no ?? null;
      if (clientId && current.clients.some((c) => c.clientId === clientId)) clientId = null;
      current.clients.push({ clientId, name: text });
    } else {
      current.items.push({
        description: r.description.trim(), keperluanId: r.keperluanId || null, qty: Number(r.qty) || 0,
        unitPrice: Number(r.unitPrice) || 0, subTotal: Number(r.subTotal ?? 0) || 0,
      });
      lastWasName = false;
    }
  }
  return groups;
}

/** Grup → baris untuk disimpan berurutan: tiap grup = baris layanan, lalu baris nama "1. Nama", "2. Nama", … (Qty 0). */
export function groupsToRows(groups: Group[]) {
  return groups.flatMap((g) => [
    ...g.items.map((it) => ({
      description: it.description.slice(0, 100), qty: Math.round(it.qty), unitPrice: BigInt(Math.round(it.unitPrice)),
      subTotal: BigInt(Math.round(it.qty * it.unitPrice)), clientNo: null as bigint | null, keperluanId: it.keperluanId ?? 0,
    })),
    ...g.clients.map((c, i) => ({
      description: `${i + 1}. ${c.name}`.slice(0, 100), qty: 0, unitPrice: 0n, subTotal: 0n,
      clientNo: c.clientId ? BigInt(c.clientId) : null, keperluanId: 0,
    })),
  ]);
}
