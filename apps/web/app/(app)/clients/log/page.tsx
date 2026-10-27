import type { Metadata } from "next";
import { Suspense } from "react";
import type { ClientLogRow, Paginated } from "@sml/shared";
import { Forbidden, PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api";
import { listQuery } from "@/lib/list-params";
import { getAccess } from "@/lib/session";
import { LogTable } from "./log-table";

export const metadata: Metadata = { title: "Data Client Log" };

export default async function ClientLogPage({ searchParams }: PageProps<"/clients/log">) {
  const { view } = await getAccess("clients.log");
  if (!view) return <><PageHeader title="Data Client Log" /><Forbidden /></>;
  const { qs } = listQuery(await searchParams, { pageSize: 50 });
  const list = await apiFetch<Paginated<ClientLogRow>>(`/clients/logs?${qs}`);
  return (
    <div>
      <PageHeader title="Data Client Log" description="Riwayat setiap perubahan data client (snapshot data saat aksi dilakukan)." />
      <Suspense>
        <LogTable list={list} />
      </Suspense>
    </div>
  );
}
