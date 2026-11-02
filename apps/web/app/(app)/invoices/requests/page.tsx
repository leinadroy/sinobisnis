import type { Metadata } from "next";
import { Suspense } from "react";
import type { Paginated, UpdateRequestRow } from "@sml/shared";
import { Forbidden, PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api";
import { listQuery } from "@/lib/list-params";
import { getAccess } from "@/lib/session";
import { RequestsTable } from "./requests-table";

export const metadata: Metadata = { title: "Update Request" };

export default async function RequestsPage({ searchParams }: PageProps<"/invoices/requests">) {
  const { me, view, edit } = await getAccess("invoices.requests");
  if (!view) return <><PageHeader title="Update Request" /><Forbidden /></>;
  const sp = await searchParams;
  const q = new URLSearchParams(listQuery(sp, { pageSize: 50 }).qs);
  // Default: yang menunggu keputusan.
  const status = typeof sp.status === "string" ? sp.status : "PENDING";
  if (status !== "ALL") q.set("status", status);
  const list = await apiFetch<Paginated<UpdateRequestRow>>(`/invoices/requests?${q}`);
  return (
    <div>
      <PageHeader title="Update Request" description="Invoice FINAL/PAID terkunci; perubahan harus diajukan lewat Request To Edit dan disetujui." />
      <Suspense>
        <RequestsTable list={list} status={status} canDecide={edit} username={me.user.username} />
      </Suspense>
    </div>
  );
}
