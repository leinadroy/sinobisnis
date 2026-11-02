import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canEdit, type InvoiceDetail, type MasterOptions, type PriceListItem } from "@sml/shared";
import { Forbidden, PageHeader } from "@/components/page-header";
import { apiFetch, ApiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { getAccess } from "@/lib/session";
import { InvoiceStatusBadge, RequestStatusBadge } from "../status-badge";
import { InvoiceAttachments } from "./invoice-attachments";
import { InvoiceForm } from "./invoice-form";
import { RequestHistory } from "./request-panel";

export async function generateMetadata({ params }: PageProps<"/invoices/[id]">): Promise<Metadata> {
  return { title: `Invoice #${(await params).id}` };
}

export default async function InvoiceDetailPage({ params }: PageProps<"/invoices/[id]">) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const { me, view, edit } = await getAccess("invoices");
  if (!view) return <><PageHeader title="Invoice" /><Forbidden /></>;
  const [detail, options] = await Promise.all([
    apiFetch<InvoiceDetail>(`/invoices/${id}`).catch((e) => { if (e instanceof ApiError && e.status === 404) notFound(); throw e; }),
    apiFetch<MasterOptions>("/master/options"),
  ]);
  const priceList = detail.billToId
    ? await apiFetch<PriceListItem[]>(`/invoices/price-list?billToId=${detail.billToId}${detail.date ? `&date=${detail.date}` : ""}`)
    : [];
  return (
    <div>
      <PageHeader
        title={`Invoice ${detail.no ?? `#${detail.id}`}`}
        description={[detail.billToName, fmtDate(detail.date), detail.createdBy && `dibuat oleh ${detail.createdBy}`].filter(Boolean).join(" · ")}
        actions={
          <div className="flex items-center gap-1">
            <InvoiceStatusBadge status={detail.status} />
            {detail.requestStatus && <RequestStatusBadge status={detail.requestStatus} />}
          </div>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <InvoiceForm detail={detail} options={options} priceList={priceList} canEdit={edit} canApprove={canEdit(me.access, "invoices.requests")} />
        <div className="space-y-4">
          <InvoiceAttachments invoiceId={detail.id} attachments={detail.attachments} editable={detail.editable && edit} />
          <RequestHistory detail={detail} />
        </div>
      </div>
    </div>
  );
}
