import type { Metadata } from "next";
import Link from "next/link";
import { canView, MATRIX_ITEMS } from "@sml/shared";
import { Card, CardContent } from "@/components/ui/card";
import { getMe } from "@/lib/session";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage() {
  const { user, access } = await getMe();
  const menus = MATRIX_ITEMS.filter((i) => canView(access, i.key));
  return (
    <div>
      <h1 className="text-2xl font-bold italic text-slate-600 md:text-3xl">Hi, kamu login sebagai : {user.fullname}</h1>
      <p className="mt-1 text-muted-foreground">Role yang digunakan : {user.roleName ?? "-"}</p>

      <h2 className="mt-8 mb-3 text-sm font-medium text-muted-foreground">Menu yang bisa Anda akses</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {menus.map((m) => (
          <Link key={m.key} href={m.href}>
            <Card className="h-full transition-colors hover:border-primary/40 hover:bg-primary/5">
              <CardContent className="py-1">
                <div className="font-medium">{m.label}</div>
                <div className="text-xs text-muted-foreground">
                  {m.group || "Menu"}{access[m.key]?.edit ? " · bisa ubah" : " · lihat saja"}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
