import { groupsToRows, rowsToGroups, type DetailRow } from './invoice-rows.js';

let id = 0;
const svc = (description: string, qty: number, unitPrice: number): DetailRow => ({ id: ++id, description, qty, unitPrice, subTotal: qty * unitPrice, clientNo: null, keperluanId: 3 });
const nm = (description: string, clientNo: number | null = null, qty = 0): DetailRow => ({ id: ++id, description, qty, unitPrice: 0, subTotal: 0, clientNo, keperluanId: 0 });
const names: Record<number, string> = { 10: 'Liang Yanmin', 11: 'Wang Yilong', 12: 'He Liwei' };

describe('rowsToGroups', () => {
  it('layanan berturut-turut satu grup; layanan setelah nama memulai grup baru', () => {
    const g = rowsToGroups([svc('Business Visa', 2, 4500000), svc('Photo', 2, 50000), nm('1. Liang Yanmin', 10), nm('2. He Liwei', 12), svc('ITAS', 1, 7000000), nm('1. Wang Yilong', 11)], (n) => names[n]);
    expect(g).toHaveLength(2);
    expect(g[0].items.map((i) => i.description)).toEqual(['Business Visa', 'Photo']);
    expect(g[0].clients).toEqual([{ clientId: 10, name: 'Liang Yanmin' }, { clientId: 12, name: 'He Liwei' }]);
    expect(g[1].items[0].subTotal).toBe(7000000);
  });

  it('ClientNo yang menunjuk client lain tidak dipakai; dicocokkan ke kandidat ber-No Invoice sama', () => {
    const g = rowsToGroups([svc('Visa', 1, 1), nm('1. Lyu Guanhan', 11), nm('2. Xu Bo', 11)], (n) => names[n], [{ no: 20, name: 'Xu Bo' }]);
    expect(g[0].clients).toEqual([{ clientId: null, name: 'Lyu Guanhan' }, { clientId: 20, name: 'Xu Bo' }]);
  });

  it('baris Qty > 0 berharga 0 yang bernomor = nama; layanan harga 0 tanpa nomor tetap layanan', () => {
    const g = rowsToGroups([svc('Visa', 1, 100), nm('12. Zhu Yanhua', null, 1), svc('Biaya admin gratis', 1, 0)], () => undefined);
    expect(g[0].clients.map((c) => c.name)).toEqual(['Zhu Yanhua']);
    expect(g[1].items.map((i) => i.description)).toEqual(['Biaya admin gratis']);
  });

  it('nama di awal (sebelum layanan) jadi item tersendiri, seperti nomor item di cetakan lama', () => {
    const g = rowsToGroups([nm('1. He Liwei', 12), svc('Visa', 1, 5)], (n) => names[n]);
    expect(g).toHaveLength(2);
    expect(g[0]).toEqual({ items: [], clients: [{ clientId: 12, name: 'He Liwei' }] });
    expect(g[1].items[0].description).toBe('Visa');
  });
});

describe('groupsToRows', () => {
  it('menulis layanan lalu nama bernomor per grup, dan bisa dibaca kembali sama', () => {
    const groups = [
      { items: [{ description: 'Business Visa', keperluanId: 3, qty: 2, unitPrice: 4500000, subTotal: 9000000 }], clients: [{ clientId: 10, name: 'Liang Yanmin' }, { clientId: null, name: 'Tanpa Data' }] },
      { items: [{ description: 'ITAS', keperluanId: null, qty: 1, unitPrice: 7000000, subTotal: 7000000 }], clients: [{ clientId: 11, name: 'Wang Yilong' }] },
    ];
    const rows = groupsToRows(groups);
    expect(rows.map((r) => r.description)).toEqual(['Business Visa', '1. Liang Yanmin', '2. Tanpa Data', 'ITAS', '1. Wang Yilong']);
    expect(rows[0].subTotal).toBe(9000000n);
    expect(rows[3].keperluanId).toBe(0);
    const back = rowsToGroups(rows.map((r, i) => ({ ...r, id: i + 1 })), (n) => names[n]);
    expect(back).toEqual(groups.map((g) => ({ ...g, items: g.items.map((it) => ({ ...it, keperluanId: it.keperluanId || null })) })));
  });
});
