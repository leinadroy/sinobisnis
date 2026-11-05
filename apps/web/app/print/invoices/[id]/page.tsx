import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { invoicePrintModel, type InvoicePrintData } from "@sml/shared";
import { Forbidden } from "@/components/page-header";
import { apiFetch, ApiError } from "@/lib/api";
import { getAccess } from "@/lib/session";
import { JcssInvoice, RtsInvoice, SmlInvoice } from "./layouts";
import { PrintToolbar } from "./print-toolbar";
import "./print.css";

export async function generateMetadata({ params }: PageProps<"/print/invoices/[id]">): Promise<Metadata> {
  return { title: `Cetak Invoice #${(await params).id}` };
}

/**
 * Cetakan invoice A4 (dibuka di tab baru). Model SML / RTS / JCSS dipilih dari awalan nomor invoice.
 * Halaman yang sama dirender headless oleh /bff/invoices/[id]/pdf untuk PDF (dengan / tanpa lampiran).
 */
export default async function PrintInvoicePage({ params }: PageProps<"/print/invoices/[id]">) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const { view } = await getAccess("invoices");
  if (!view) return <div className="p-6"><Forbidden /></div>;
  const data = await apiFetch<InvoicePrintData>(`/invoices/${id}/print`)
    .catch((e) => { if (e instanceof ApiError && e.status === 404) notFound(); throw e; });

  const model = invoicePrintModel(data.invoice.no);
  const Layout = model === "RTS" ? RtsInvoice : model === "JCSS" ? JcssInvoice : SmlInvoice;

  return (
    <div className="invoice-print">
      <PrintToolbar invoiceId={Number(id)} model={model} attachmentCount={data.invoice.attachments.length} />
      {data.invoice.status === "DRAFT" && <p className="draft-note print:hidden">DRAFT — belum final</p>}
      <Layout data={data} />
    </div>
  );
}
