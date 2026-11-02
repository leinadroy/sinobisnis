import type { Metadata } from "next";
import { Suspense } from "react";
import type { InvoiceableClientRow, MasterOptions } from "@sml/shared";
import { Forbidden, PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api";
import { getAccess } from "@/lib/session";
import { CREATE_FILTER_KEYS } from "../filters";
import { CreateInvoiceForm } from "./create-form";

export const metadata: Metadata = { title: "Create Invoice" };

export default async function CreateInvoicePage({ searchParams }: PageProps<"/invoices/create">) {
  const { view, edit } = await getAccess("invoices.create");
  if (!view) return <><PageHeader title="Create Invoice" /><Forbidden /></>;
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const k of CREATE_FILTER_KEYS) if (typeof sp[k] === "string" && sp[k]) q.set(k, sp[k] as string);
  const [clients, options] = await Promise.all([
    apiFetch<InvoiceableClientRow[]>(`/invoices/invoiceable-clients?${q}`),
    apiFetch<MasterOptions>("/master/options"),
  ]);
  return (
    <div>
      <PageHeader title="Create Invoice" description="Pilih client yang sudah selesai diproses dan belum punya invoice, lalu buat invoice DRAFT." />
      <Suspense>
        <CreateInvoiceForm clients={clients} options={options} canEdit={edit} />
      </Suspense>
    </div>
  );
}
