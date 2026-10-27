import type { Metadata } from "next";
import { Suspense } from "react";
import type { Paginated, PersonRow } from "@sml/shared";
import { Forbidden, PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api";
import { listQuery } from "@/lib/list-params";
import { getAccess } from "@/lib/session";
import { PeopleTable } from "./people-table";

export const metadata: Metadata = { title: "Client List" };

export default async function PeoplePage({ searchParams }: PageProps<"/clients/people">) {
  const { view, me } = await getAccess("clients.people");
  if (!view) return <><PageHeader title="Client List" /><Forbidden /></>;
  const { qs } = listQuery(await searchParams, { pageSize: 50 });
  const list = await apiFetch<Paginated<PersonRow>>(`/clients/people?${qs}`);
  return (
    <div>
      <PageHeader title="Client List" description="Daftar orang (nama + paspor) beserta jumlah permohonannya." />
      <Suspense>
        <PeopleTable list={list} canCreate={Boolean(me.access.clients?.edit)} />
      </Suspense>
    </div>
  );
}
