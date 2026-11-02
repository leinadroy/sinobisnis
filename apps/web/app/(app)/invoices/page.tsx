import type { Metadata } from "next";
import { Suspense } from "react";
import { canEdit, type InvoiceList, type MasterOptions } from "@sml/shared";
import { Forbidden, PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api";
import { listQuery } from "@/lib/list-params";
import { getAccess } from "@/lib/session";
import { INVOICE_FILTER_KEYS } from "./filters";
import { InvoicesTable } from "./invoices-table";

export const metadata: Metadata = { title: "Invoice List" };

export default async function InvoicesPage({ searchParams }: PageProps<"/invoices">) {
  const { me, view } = await getAccess("invoices");
  if (!view) return <><PageHeader title="Invoice List" /><Forbidden /></>;
  const sp = await searchParams;
  const q = new URLSearchParams(listQuery(sp, { pageSize: 50 }).qs);
  for (const k of INVOICE_FILTER_KEYS) if (typeof sp[k] === "string" && sp[k]) q.set(k, sp[k] as string);
  const [list, options] = await Promise.all([
    apiFetch<InvoiceList>(`/invoices?${q}`),
    apiFetch<MasterOptions>("/master/options"),
  ]);
  return (
    <div>
      <PageHeader title="Invoice List" />
      <Suspense>
        <InvoicesTable list={list} options={options} canCreate={canEdit(me.access, "invoices.create")} />
      </Suspense>
    </div>
  );
}
