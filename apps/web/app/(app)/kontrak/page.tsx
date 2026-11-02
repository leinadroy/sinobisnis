import type { Metadata } from "next";
import { Suspense } from "react";
import type { KontrakRow, Paginated } from "@sml/shared";
import { Forbidden, PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api";
import { listQuery } from "@/lib/list-params";
import { getAccess } from "@/lib/session";
import { KontrakTable } from "./kontrak-table";

export const metadata: Metadata = { title: "Kontrak" };

export default async function KontrakPage({ searchParams }: PageProps<"/kontrak">) {
  const { view, edit } = await getAccess("kontrak");
  if (!view) return <><PageHeader title="Kontrak" /><Forbidden /></>;
  const list = await apiFetch<Paginated<KontrakRow>>(`/kontrak?${listQuery(await searchParams).qs}`);
  return (
    <div>
      <PageHeader title="Kontrak" description="Daftar harga per Bill To. Kontrak terbaru yang berlaku (tanggal ≤ tanggal invoice) dipakai saat Create Invoice." />
      <Suspense>
        <KontrakTable list={list} canEdit={edit} />
      </Suspense>
    </div>
  );
}
