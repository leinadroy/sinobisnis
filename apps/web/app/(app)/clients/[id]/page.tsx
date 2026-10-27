import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ClientDetail, MasterOptions } from "@sml/shared";
import { Badge } from "@/components/ui/badge";
import { Forbidden, PageHeader } from "@/components/page-header";
import { apiFetch, ApiError } from "@/lib/api";
import { getAccess } from "@/lib/session";
import { AttachmentsPanel } from "../attachments-panel";
import { ClientForm } from "../client-form";
import { ConversationPanel } from "../conversation-panel";
import { toFormValues } from "../form-values";

export async function generateMetadata({ params }: PageProps<"/clients/[id]">): Promise<Metadata> {
  return { title: `Client #${(await params).id}` };
}

export default async function ClientDetailPage({ params }: PageProps<"/clients/[id]">) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const { view, edit } = await getAccess("clients");
  if (!view) return <><PageHeader title="Client" /><Forbidden /></>;
  const [client, options] = await Promise.all([
    apiFetch<ClientDetail>(`/clients/${id}`).catch((e) => { if (e instanceof ApiError && e.status === 404) notFound(); throw e; }),
    apiFetch<MasterOptions>("/master/options"),
  ]);
  return (
    <div>
      <PageHeader
        title={`Client Form — #${client.id}`}
        description={[client.name, client.keperluanName, client.sponsorName].filter(Boolean).join(" · ")}
        actions={client.isArchived ? <Badge variant="destructive">Archived</Badge> : undefined}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ClientForm key={client.updatedAt} id={client.id} initial={toFormValues(client)} options={options} canEdit={edit} invoiceId={client.invoiceId} />
        <div className="space-y-4">
          <AttachmentsPanel clientId={client.id} attachments={client.attachments} canEdit={edit} />
          <ConversationPanel clientId={client.id} conversations={client.conversations} history={client.history} />
        </div>
      </div>
    </div>
  );
}
