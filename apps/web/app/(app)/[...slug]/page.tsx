import { notFound } from "next/navigation";
import { canView, MENU_ITEMS } from "@sml/shared";
import { Forbidden, PageHeader } from "@/components/page-header";
import { getMe } from "@/lib/session";

/** Placeholder untuk menu yang dibangun di tahap berikutnya (Client, Invoice, master data, reminder). */
export default async function PendingModulePage({ params }: PageProps<"/[...slug]">) {
  const { slug } = await params;
  const href = "/" + slug.join("/");
  const item = MENU_ITEMS.find((i) => i.href === href);
  if (!item) notFound();
  const { access } = await getMe();
  return (
    <div>
      <PageHeader title={item.label} />
      {canView(access, item.key) ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Modul <b>{item.label}</b> sedang dipindahkan ke stack baru dan akan tersedia di tahap berikutnya.
        </div>
      ) : (
        <Forbidden />
      )}
    </div>
  );
}
