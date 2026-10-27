import type { Metadata } from "next";
import { Suspense } from "react";
import type { ClientRow, MasterOptions, Paginated } from "@sml/shared";
import { Forbidden, PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api";
import { clientListQuery } from "@/lib/client-list";
import { getAccess } from "@/lib/session";
import { ClientsTable } from "./clients-table";

export const metadata: Metadata = { title: "Data Client Visa" };

export default async function ClientsPage({ searchParams }: PageProps<"/clients">) {
  const { view, edit } = await getAccess("clients");
  if (!view) return <><PageHeader title="Data Client Visa" /><Forbidden /></>;
  const qs = clientListQuery(await searchParams);
  const [list, options] = await Promise.all([
    apiFetch<Paginated<ClientRow>>(`/clients?${qs}`),
    apiFetch<MasterOptions>("/master/options"),
  ]);
  return (
    <div>
      <PageHeader title="Data Client Visa" />
      <Suspense>
        <ClientsTable list={list} options={options} canEdit={edit} />
      </Suspense>
    </div>
  );
}
