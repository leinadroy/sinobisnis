// Definisi menu tunggal: sidebar (web), matriks hak akses role, dan guard menu (api).
// Item `always` selalu tersedia bagi user yang login dan tidak masuk matriks.

export interface MenuLeaf {
  key: string;
  label: string;
  href: string;
  icon?: string;
  always?: boolean;
  /** Hanya untuk role Developer; tidak masuk matriks hak akses. */
  superOnly?: boolean;
  /**
   * Baris menuitem di database (hak akses role disimpan di rolepgmname per MenuItemId).
   * Id ≥ 38 belum ada di aplikasi lama dan dibuat otomatis oleh API (lihat NEW_MENU_ITEMS).
   */
  menuItemId?: number;
}

export interface MenuGroup {
  label: string;
  icon: string;
  children: MenuLeaf[];
}

export type MenuEntry = MenuLeaf | MenuGroup;

export const isGroup = (m: MenuEntry): m is MenuGroup => 'children' in m;

// Susunan sama dengan menu production https://smlgroupid.com/sinobisnis (dicek 2026-11-04). Developer Menu production
// berisi halaman tabel bawaan GeneXus; di sini hanya halaman yang ada di aplikasi baru, dengan urutan yang sama.
export const MENU: MenuEntry[] = [
  { key: 'home', menuItemId: 2, label: 'Home', icon: 'home', href: '/', always: true },
  {
    label: 'Data',
    icon: 'table',
    children: [
      { key: 'clients', menuItemId: 4, label: 'Data Client Visa', href: '/clients' },
      { key: 'clients.archived', menuItemId: 27, label: 'Client Archived', href: '/clients/archived' },
      { key: 'clients.people', menuItemId: 28, label: 'Client List', href: '/clients/people' },
      { key: 'invoices.create', menuItemId: 17, label: 'Create Invoice', href: '/invoices/create' },
      { key: 'invoices', menuItemId: 18, label: 'Invoice List', href: '/invoices' },
      { key: 'companies', menuItemId: 19, label: 'Company', href: '/master/companies' },
      { key: 'bank-accounts', menuItemId: 20, label: 'Bank Account', href: '/master/bank-accounts' },
      { key: 'keperluan', menuItemId: 21, label: 'Keperluan', href: '/master/keperluan' },
      { key: 'sponsors', menuItemId: 22, label: 'Sponsor', href: '/master/sponsors' },
      { key: 'sponsor-projects', menuItemId: 29, label: 'Sponsor Project', href: '/master/sponsor-projects' },
      { key: 'bill-to', menuItemId: 26, label: 'Bill To', href: '/master/bill-to' },
      { key: 'clients.log', menuItemId: 30, label: 'Data Client Log', href: '/clients/log' },
      { key: 'invoices.requests', menuItemId: 31, label: 'Update Request', href: '/invoices/requests' },
      { key: 'kontrak', menuItemId: 33, label: 'Kontrak', href: '/kontrak' },
    ],
  },
  {
    label: 'Security',
    icon: 'shield',
    children: [
      { key: 'users', menuItemId: 9, label: 'Users', href: '/security/users' },
      { key: 'roles', menuItemId: 23, label: 'Role', href: '/security/roles' },
    ],
  },
  {
    label: 'Account',
    icon: 'user',
    children: [
      { key: 'profile', menuItemId: 12, label: 'Edit Profile', href: '/account/profile', always: true },
      { key: 'password', menuItemId: 24, label: 'Change Password', href: '/account/password', always: true },
      { key: 'logout', menuItemId: 13, label: 'Logout', href: '/logout', always: true },
    ],
  },
  {
    label: 'Developer Menu',
    icon: 'code',
    children: [
      { key: 'email-templates', menuItemId: 14, label: 'Email Template', href: '/master/email-templates' },
      { key: 'role-access', menuItemId: 39, label: 'Role Pgmname', href: '/security/role-access' },
      { key: 'email-recipients', menuItemId: 41, label: 'Email Recipient', href: '/master/email-recipients' },
      { key: 'taxes', menuItemId: 38, label: 'Tax', href: '/master/taxes' },
      { key: 'system-config', menuItemId: 42, label: 'System Configurator', href: '/developer/system-config' },
      // Tidak ada di menu production (di sana reminder hanya berjalan terjadwal); halaman pantau & kirim manual.
      { key: 'reminders', menuItemId: 40, label: 'Email Reminder', href: '/reminders' },
      // Pilih profil koneksi database (isi koneksi di .env server); hanya role Developer.
      { key: 'database', label: 'Database', href: '/developer/database', superOnly: true },
    ],
  },
];

/** Menu baru yang belum punya baris menuitem di database lama: [menuItemId, caption, induk (menuitem), link]. */
export const NEW_MENU_ITEMS: [id: number, caption: string, fatherId: number, link: string][] = [
  [38, 'Tax', 3, 'tax-list'],
  [39, 'Hak Akses Role', 8, 'role-access'],
  [40, 'Email Reminder', 5, 'email-reminder'],
  [41, 'Email Recipient', 5, 'email-recipient-list'],
  [42, 'System Configurator', 5, 'system-configurator'],
];

export interface MatrixItem extends MenuLeaf {
  group: string;
}

export const MENU_ITEMS: MatrixItem[] = MENU.flatMap((m) =>
  isGroup(m) ? m.children.map((c) => ({ ...c, group: m.label })) : [{ ...m, group: '' }],
);

/** Menu yang diatur lewat matriks hak akses (tanpa item `always`). */
export const MATRIX_ITEMS: MatrixItem[] = MENU_ITEMS.filter((i) => !i.always && !i.superOnly);
export const MATRIX_KEYS: string[] = MATRIX_ITEMS.map((i) => i.key);
export type MenuKey = string;

/** Key menu untuk MenuItemId (beberapa baris rolepgmname bisa menunjuk menu yang sama). */
export const MENU_KEY_BY_ITEM_ID: Record<number, string> = Object.fromEntries(
  MATRIX_ITEMS.filter((i) => i.menuItemId).map((i) => [i.menuItemId!, i.key]),
);
