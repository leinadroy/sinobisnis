"use client";

import { useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { REQUEST_STATUSES, type Paginated, type UpdateRequestRow } from "@sml/shared";
import { Button } from "@/components/ui/button";
import { SearchSelect } from "@/components/ui/search-select";
import { DataTable } from "@/components/data-table/data-table";
import { RecordCard } from "@/components/data-table/record-card";
import { fmtDate } from "@/lib/format";
import { decideRequest } from "../actions";
import { RequestStatusBadge } from "../status-badge";

function Decide({ r, username }: { r: UpdateRequestRow; username: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (approve: boolean) => start(async () => {
    const res = await decideRequest(r.id, r.invoiceId, approve);
    if (!res.ok) return void toast.error(res.error);
    toast.success(approve ? `Request ${r.invoiceNo} disetujui.` : `Request ${r.invoiceNo} ditolak.`);
    router.refresh();
  });
  if (r.status !== "PENDING") return null;
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="outline" className="border-green-300 text-green-800" disabled={pending} onClick={() => run(true)}
        title={r.requestedBy === username ? "Request sendiri — biasanya diputuskan user lain" : undefined}><Check /> Approve</Button>
      <Button size="sm" variant="outline" className="border-red-300 text-red-700" disabled={pending} onClick={() => run(false)}><X /> Reject</Button>
    </div>
  );
}

export function RequestsTable({ list, status, canDecide, username }: { list: Paginated<UpdateRequestRow>; status: string; canDecide: boolean; username: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const items = [{ value: "ALL", label: "Semua status" }, ...REQUEST_STATUSES.map((s) => ({ value: s, label: s }))];

  const base: ColumnDef<UpdateRequestRow, unknown>[] = [
    { id: "createdAt", header: "Tanggal", cell: ({ row }) => <span className="whitespace-nowrap">{fmtDate(row.original.createdAt)}</span> },
    { id: "invoiceNo", header: "Invoice", cell: ({ row }) => <Link href={`/invoices/${row.original.invoiceId}`} className="font-medium text-primary hover:underline">{row.original.invoiceNo ?? `#${row.original.invoiceId}`}</Link> },
    { id: "requestedBy", accessorKey: "requestedBy", header: "Oleh" },
    { id: "status", header: "Status", cell: ({ row }) => <RequestStatusBadge status={row.original.status} /> },
    { id: "updated", header: "Diperbarui", cell: ({ row }) => <span className="whitespace-nowrap">{fmtDate(row.original.updatedAt)}</span> },
    ...(canDecide ? [{ id: "actions", header: "", cell: ({ row }: { row: { original: UpdateRequestRow } }) => <Decide r={row.original} username={username} /> }] : []),
  ];
  const columns = base.map((c) => ({ ...c, enableSorting: false, meta: { label: typeof c.header === "string" ? c.header : c.id } }));

  return (
    <DataTable
      columns={columns}
      data={list.data}
      total={list.total}
      page={list.page}
      pageSize={list.pageSize}
      searchPlaceholder="Cari no invoice, user…"
      toolbar={
        <SearchSelect items={items} value={status} onValueChange={(v) => {
          const next = new URLSearchParams(params.toString());
          next.set("status", v ?? "ALL");
          next.set("page", "1");
          start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
        }} className="w-44" aria-label="Status" disabled={pending} />
      }
      renderCard={(r) => (
        <RecordCard
          title={<Link href={`/invoices/${r.invoiceId}`} className="text-primary hover:underline">{r.invoiceNo ?? `#${r.invoiceId}`}</Link>}
          fields={[
            ["Status", <RequestStatusBadge key="s" status={r.status} />],
            ["Tanggal", fmtDate(r.createdAt)],
            ["Oleh", r.requestedBy],
            ["Diperbarui", fmtDate(r.updatedAt)],
          ]}
          actions={canDecide ? <Decide r={r} username={username} /> : undefined}
        />
      )}
    />
  );
}
