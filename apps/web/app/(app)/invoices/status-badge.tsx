import type { InvoiceStatus, RequestStatus } from "@sml/shared";
import { cn } from "@/lib/utils";

const INVOICE_TONE: Record<InvoiceStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  FINAL: "bg-blue-100 text-blue-700",
  PAID: "bg-green-100 text-green-700",
};

const REQUEST_TONE: Record<RequestStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-slate-100 text-slate-600",
  DONE: "bg-blue-100 text-blue-700",
};

const base = "inline-flex h-5 items-center rounded-4xl px-2 text-xs font-medium whitespace-nowrap";

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <span className={cn(base, INVOICE_TONE[status])}>{status}</span>;
}

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return <span className={cn(base, REQUEST_TONE[status])}>{status}</span>;
}
