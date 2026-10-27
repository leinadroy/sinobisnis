"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Code, House, Mail, Menu as MenuIcon, Shield, Table2, UserRound, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type NavLeaf = { key: string; label: string; href: string; icon?: string };
export type NavGroup = { label: string; icon: string; children: NavLeaf[] };
export type NavEntry = NavLeaf | NavGroup;

const ICONS: Record<string, LucideIcon> = { home: House, table: Table2, mail: Mail, shield: Shield, user: UserRound, code: Code };
const isGroup = (e: NavEntry): e is NavGroup => "children" in e;

/** Href aktif = prefix terpanjang yang cocok dengan path sekarang. */
function useActiveHref(nav: NavEntry[]) {
  const pathname = usePathname();
  const hrefs = nav.flatMap((e) => (isGroup(e) ? e.children.map((c) => c.href) : [e.href]));
  return hrefs
    .filter((h) => (h === "/" ? pathname === "/" : pathname === h || pathname.startsWith(h + "/")))
    .sort((a, b) => b.length - a.length)[0];
}

function Nav({ nav, onNavigate }: { nav: NavEntry[]; onNavigate?: () => void }) {
  const active = useActiveHref(nav);
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(nav.filter(isGroup).map((g) => [g.label, g.children.some((c) => c.href === active)])),
  );
  return (
    <nav className="flex flex-col gap-1 p-3 text-sm">
      {nav.map((e) => {
        const Icon = ICONS[e.icon ?? ""] ?? Table2;
        if (!isGroup(e)) {
          return (
            <Link key={e.href} href={e.href} onClick={onNavigate}
              className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-muted-foreground hover:bg-muted",
                active === e.href && "bg-primary text-primary-foreground hover:bg-primary")}>
              <Icon className="size-4" /> {e.label}
            </Link>
          );
        }
        const isOpen = open[e.label];
        return (
          <div key={e.label}>
            <button type="button" onClick={() => setOpen((o) => ({ ...o, [e.label]: !o[e.label] }))}
              className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-muted-foreground hover:bg-muted",
                isOpen && "bg-primary/10 text-primary")}
              aria-expanded={isOpen}>
              <Icon className="size-4" /> <span className="flex-1 text-left">{e.label}</span>
              <ChevronRight className={cn("size-3.5 transition-transform", isOpen && "rotate-90")} />
            </button>
            {isOpen && (
              <div className="ml-6 mt-1 flex flex-col border-l pl-2">
                {e.children.map((c) => (
                  <Link key={c.href} href={c.href} onClick={onNavigate}
                    className={cn("rounded-md px-3 py-2 text-muted-foreground hover:bg-muted",
                      active === c.href && "bg-primary/10 font-medium text-primary")}>
                    {c.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export function AppShell({ nav, user, children }: { nav: NavEntry[]; user: { fullname: string; roleName: string | null }; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background px-3 shadow-sm md:h-16 md:px-5">
        <Button variant="ghost" size="icon" className="md:hidden text-orange-600" aria-label="Buka menu" onClick={() => setMobileOpen(true)}>
          <MenuIcon className="size-5" />
        </Button>
        <Link href="/" className="shrink-0"><Image src="/logo.svg" alt="Sinobisnis Mitra Lestari" width={220} height={44} className="h-8 w-auto md:h-10" priority /></Link>
        <div className="ml-auto hidden text-sm text-muted-foreground sm:block">
          {user.fullname} <span className="text-xs">({user.roleName ?? "tanpa role"})</span>
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="sticky top-16 hidden h-[calc(100svh-4rem)] w-64 shrink-0 overflow-y-auto border-r bg-muted/30 md:block">
          <Nav nav={nav} />
        </aside>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-72 overflow-y-auto p-0">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <div className="h-6" />
            <Nav nav={nav} onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
        <main className="min-w-0 flex-1 px-3 py-4 md:px-6 md:py-6">{children}</main>
      </div>
    </div>
  );
}
