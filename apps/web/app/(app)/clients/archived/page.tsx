import type { Metadata } from "next";
import { Suspense } from "react";
import type { ClientRow, MasterOptions, Paginated } from "@sml/shared";
import { Forbidden, PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api";
import { clientListQuery } from "@/lib/client-list";
import { getAccess } from "@/lib/session";
import { ClientsTable } from "../clients-table";

export const metadata: Metadata = { title: "Client Archived" };

export default async function ArchivedClientsPage({ searchParams }: PageProps<"/clients/archived">) {
  const { view, me } = await getAccess("clients.archived");
  if (!view) return <><PageHeader title="Client Archived" /><Forbidden /></>;
  const qs = clientListQuery(await searchParams);
  const [list, options] = await Promise.all([
    apiFetch<Paginated<ClientRow>>(`/clients/archived?${qs}`),
    apiFetch<MasterOptions>("/master/options"),
  ]);
  return (
    <div>
      <PageHeader title="Client Archived" description="Client yang diarsipkan. Buka client untuk mengembalikannya dari arsip." />
      <Suspense>
        <ClientsTable list={list} options={options} canEdit={Boolean(me.access.clients?.edit)} archived />
      </Suspense>
    </div>
  );
}
