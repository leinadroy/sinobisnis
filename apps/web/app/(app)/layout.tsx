import { isGroup, MENU, canView } from "@sml/shared";
import { AppShell, type NavEntry } from "@/components/app-shell";
import { getMe } from "@/lib/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, access } = await getMe();
  // Sidebar disaring di server sesuai matriks hak akses; menu grup kosong disembunyikan.
  const visible = (i: { key: string; always?: boolean }) => Boolean(i.always) || canView(access, i.key);
  const nav: NavEntry[] = MENU.flatMap((m): NavEntry[] => {
    if (isGroup(m)) {
      const children = m.children.filter(visible).map(({ key, label, href }) => ({ key, label, href }));
      return children.length ? [{ label: m.label, icon: m.icon, children }] : [];
    }
    return visible(m) ? [{ key: m.key, label: m.label, href: m.href, icon: m.icon }] : [];
  });
  return (
    <AppShell nav={nav} user={{ fullname: user.fullname, roleName: user.roleName }}>
      {children}
    </AppShell>
  );
}
