import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { KontrakDetail, MasterOptions } from "@sml/shared";
import { Forbidden, PageHeader } from "@/components/page-header";
import { apiFetch, ApiError } from "@/lib/api";
import { getAccess } from "@/lib/session";
import { KontrakForm } from "../kontrak-form";

export const metadata: Metadata = { title: "Kontrak" };

export default async function KontrakDetailPage({ params }: PageProps<"/kontrak/[id]">) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const { view, edit } = await getAccess("kontrak");
  if (!view) return <><PageHeader title="Kontrak" /><Forbidden /></>;
  const [k, options] = await Promise.all([
    apiFetch<KontrakDetail>(`/kontrak/${id}`).catch((e) => { if (e instanceof ApiError && e.status === 404) notFound(); throw e; }),
    apiFetch<MasterOptions>("/master/options"),
  ]);
  return (
    <div>
      <PageHeader title={edit ? "Kontrak — Update" : "Kontrak"} description={k.billToName} />
      <KontrakForm key={JSON.stringify(k)} id={k.id} options={options} canEdit={edit} initial={k} />
    </div>
  );
}
