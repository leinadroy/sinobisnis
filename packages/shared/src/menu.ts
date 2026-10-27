// Definisi menu tunggal: sidebar (web), matriks hak akses role, dan guard menu (api).
// Item `always` selalu tersedia bagi user yang login dan tidak masuk matriks.

export interface MenuLeaf {
  key: string;
  label: string;
  href: string;
  icon?: string;
  always?: boolean;
}

export interface MenuGroup {
  label: string;
  icon: string;
  children: MenuLeaf[];
}

export type MenuEntry = MenuLeaf | MenuGroup;

export const isGroup = (m: MenuEntry): m is MenuGroup => 'children' in m;

export const MENU: MenuEntry[] = [
  { key: 'home', label: 'Home', icon: 'home', href: '/', always: true },
  {
    label: 'Data',
    icon: 'table',
    children: [
      { key: 'clients', label: 'Data Client Visa', href: '/clients' },
      { key: 'clients.archived', label: 'Client Archived', href: '/clients/archived' },
      { key: 'clients.people', label: 'Client List', href: '/clients/people' },
      { key: 'invoices.create', label: 'Create Invoice', href: '/invoices/create' },
      { key: 'invoices', label: 'Invoice List', href: '/invoices' },
      { key: 'companies', label: 'Company', href: '/master/companies' },
      { key: 'bank-accounts', label: 'Bank Account', href: '/master/bank-accounts' },
      { key: 'keperluan', label: 'Keperluan', href: '/master/keperluan' },
      { key: 'sponsors', label: 'Sponsor', href: '/master/sponsors' },
      { key: 'sponsor-projects', label: 'Sponsor Project', href: '/master/sponsor-projects' },
      { key: 'bill-to', label: 'Bill To', href: '/master/bill-to' },
      { key: 'taxes', label: 'Tax', href: '/master/taxes' },
      { key: 'clients.log', label: 'Data Client Log', href: '/clients/log' },
      { key: 'invoices.requests', label: 'Update Request', href: '/invoices/requests' },
      { key: 'kontrak', label: 'Kontrak', href: '/kontrak' },
    ],
  },
  { key: 'reminders', label: 'Email Reminder', icon: 'mail', href: '/reminders' },
  {
    label: 'Security',
    icon: 'shield',
    children: [
      { key: 'users', label: 'Users', href: '/security/users' },
      { key: 'roles', label: 'Role', href: '/security/roles' },
      { key: 'role-access', label: 'Hak Akses Role', href: '/security/role-access' },
    ],
  },
  {
    label: 'Account',
    icon: 'user',
    children: [
      { key: 'profile', label: 'Edit Profile', href: '/account/profile', always: true },
      { key: 'password', label: 'Change Password', href: '/account/password', always: true },
      { key: 'logout', label: 'Logout', href: '/logout', always: true },
    ],
  },
  {
    label: 'Developer Menu',
    icon: 'code',
    children: [
      { key: 'email-templates', label: 'Email Template', href: '/developer/email-templates' },
      { key: 'email-recipients', label: 'Email Recipient', href: '/developer/email-recipients' },
      { key: 'system-config', label: 'System Configurator', href: '/developer/system-config' },
    ],
  },
];

export interface MatrixItem extends MenuLeaf {
  group: string;
}

export const MENU_ITEMS: MatrixItem[] = MENU.flatMap((m) =>
  isGroup(m) ? m.children.map((c) => ({ ...c, group: m.label })) : [{ ...m, group: '' }],
);

/** Menu yang diatur lewat matriks hak akses (tanpa item `always`). */
export const MATRIX_ITEMS: MatrixItem[] = MENU_ITEMS.filter((i) => !i.always);
export const MATRIX_KEYS: string[] = MATRIX_ITEMS.map((i) => i.key);
export type MenuKey = string;
