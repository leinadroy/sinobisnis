"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import type { ClientLogRow, Paginated } from "@sml/shared";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/data-table/data-table";
import { RecordCard } from "@/components/data-table/record-card";
import { fmtDate, fmtDateTime } from "@/lib/format";

const snap = (k: string) => (r: ClientLogRow) => (r.snapshot as Record<string, unknown> | null)?.[k] as string | null | undefined;

export function LogTable({ list }: { list: Paginated<ClientLogRow> }) {
  const text = (id: string, label: string) => ({ id, header: label, meta: { label }, enableSorting: false, accessorFn: snap(id) }) satisfies ColumnDef<ClientLogRow, unknown>;
  const date = (id: string, label: string): ColumnDef<ClientLogRow, unknown> => ({ ...text(id, label), cell: ({ row }) => <span className="whitespace-nowrap">{fmtDate(snap(id)(row.original))}</span> });
  const columns: ColumnDef<ClientLogRow, unknown>[] = [
    { id: "historyDate", header: "History Date", enableSorting: false, enableHiding: false, cell: ({ row }) => <span className="whitespace-nowrap">{fmtDateTime(row.original.historyDate)}</span> },
    { id: "userName", accessorKey: "userName", header: "User Name", enableSorting: false, meta: { label: "User Name" } },
    { id: "action", header: "Action", enableSorting: false, meta: { label: "Action" }, cell: ({ row }) => <Badge variant={row.original.action === "DELETE" ? "destructive" : "secondary"}>{row.original.action}</Badge> },
    {
      id: "clientId", header: "Client No", enableSorting: false, meta: { label: "Client No" },
      cell: ({ row }) => row.original.action === "DELETE" || !row.original.clientId
        ? row.original.clientId
        : <Link className="text-primary hover:underline" href={`/clients/${row.original.clientId}`}>{row.original.clientId}</Link>,
    },
    text("name", "Name"), text("noPaspor", "No Paspor"), text("sponsorName", "Sponsor"), text("keperluanName", "Keperluan"),
    date("tanggalProsesSelesai", "Proses Selesai"), date("expiredDokumen", "Expired Dokumen"), text("noInvoice", "No Invoice"), text("status", "Status"),
  ];
  return (
    <DataTable columns={columns} data={list.data} total={list.total} page={list.page} pageSize={list.pageSize}
      searchPlaceholder="Cari user, aksi, nama client, atau no client…"
      renderCard={(r) => {
        const v = (k: string) => snap(k)(r) ?? "";
        return (
          <RecordCard
            title={r.action === "DELETE" || !r.clientId
              ? (v("name") || `Client #${r.clientId ?? "-"}`)
              : <Link className="text-primary hover:underline" href={`/clients/${r.clientId}`}>{v("name") || `Client #${r.clientId}`}</Link>}
            subtitle={`${fmtDateTime(r.historyDate)} · ${r.userName ?? "-"}`}
            badge={<Badge variant={r.action === "DELETE" ? "destructive" : "secondary"}>{r.action}</Badge>}
            fields={[["Client No", r.clientId], ["No Paspor", v("noPaspor")], ["Sponsor", v("sponsorName")], ["Keperluan", v("keperluanName")],
              ["Expired Dokumen", fmtDate(v("expiredDokumen"))], ["Status", v("status")]]}
          />
        );
      }} />
  );
}
