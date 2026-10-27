import type { Metadata } from "next";
import type { ClientDetail, MasterOptions } from "@sml/shared";
import { Forbidden, PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api";
import { getAccess } from "@/lib/session";
import { ClientForm } from "../client-form";
import { toFormValues } from "../form-values";

export const metadata: Metadata = { title: "Client Baru" };

export default async function NewClientPage({ searchParams }: PageProps<"/clients/new">) {
  const { edit } = await getAccess("clients");
  if (!edit) return <><PageHeader title="Client Form — Insert" /><Forbidden /></>;
  const sp = await searchParams;
  const copyId = typeof sp.copy === "string" && /^\d+$/.test(sp.copy) ? sp.copy : null;
  const [options, source] = await Promise.all([
    apiFetch<MasterOptions>("/master/options"),
    copyId ? apiFetch<ClientDetail>(`/clients/${copyId}`).catch(() => null) : null,
  ]);
  // "Permohonan baru untuk client ini": salin identitas orang & sponsor, bukan data proses/invoice.
  const initial = toFormValues(source && {
    sponsorId: source.sponsorId, projectId: source.projectId, name: source.name, noPaspor: source.noPaspor, tanggalLahir: source.tanggalLahir,
  });
  return (
    <div>
      <PageHeader title="Client Form — Insert" description={source ? `Permohonan baru untuk ${source.name} (disalin dari client #${source.id}).` : undefined} />
      <ClientForm initial={initial} options={options} canEdit />
    </div>
  );
}
