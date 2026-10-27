import { MATRIX_KEYS } from './menu.js';

/** Role ini selalu punya akses penuh supaya pengaturan hak akses tidak bisa mengunci semua orang. */
export const SUPER_ROLE = 'Developer';

export interface MenuAccess {
  view: boolean;
  edit: boolean;
}

/** Hak akses user per key menu. */
export type AccessMap = Record<string, MenuAccess>;

type Pair = [view: 0 | 1, edit: 0 | 1];
const full = (): Record<string, Pair> => Object.fromEntries(MATRIX_KEYS.map((k) => [k, [1, 1] as Pair]));

/** Matriks default, disalin dari Role Pgmname production (sinobisnis). */
export const DEFAULT_ACCESS: Record<string, Record<string, Pair>> = {
  'All Access': full(),
  Developer: full(),
  Editor: {
    clients: [1, 1], 'clients.archived': [1, 1], 'clients.people': [1, 1], 'clients.log': [1, 1],
    keperluan: [1, 1], kontrak: [1, 1], 'sponsor-projects': [1, 1], sponsors: [1, 1], reminders: [1, 0],
  },
  Finance: {
    'invoices.create': [1, 1], invoices: [1, 1], 'bank-accounts': [1, 1], 'bill-to': [1, 1], 'clients.log': [1, 1],
    'clients.people': [1, 1], clients: [1, 1], 'clients.archived': [1, 1], companies: [1, 1], keperluan: [1, 1],
    kontrak: [1, 1], 'sponsor-projects': [1, 1], sponsors: [1, 1], taxes: [1, 1], reminders: [1, 0],
    // Production memberi Finance edit di Update Request; di sini hanya lihat agar tidak menyetujui request sendiri.
    'invoices.requests': [1, 0],
  },
  Viewer: {
    'bank-accounts': [1, 0], 'clients.people': [1, 0], clients: [1, 0], 'clients.archived': [1, 0],
    companies: [1, 0], keperluan: [1, 0], kontrak: [1, 0], sponsors: [1, 0],
  },
};

export function canView(access: AccessMap, key: string): boolean {
  return Boolean(access[key]?.view);
}

export function canEdit(access: AccessMap, key: string): boolean {
  return Boolean(access[key]?.view && access[key]?.edit);
}
