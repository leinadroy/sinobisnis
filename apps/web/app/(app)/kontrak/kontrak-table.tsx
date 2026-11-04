"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Pencil, Plus } from "lucide-react";
import type { KontrakRow, Paginated } from "@sml/shared";
import { Button } from "@/components/ui/button";
import { ConfirmDelete } from "@/components/confirm-delete";
import { DataTable } from "@/components/data-table/data-table";
import { RecordCard } from "@/components/data-table/record-card";
import { SortHeader } from "@/components/data-table/column-header";
import { fmtDate } from "@/lib/format";
import { deleteKontrak } from "./actions";

export function KontrakTable({ list, canEdit }: { list: Paginated<KontrakRow>; canEdit: boolean }) {
  const actions = (r: KontrakRow) => (
    <>
      <Button variant="ghost" size="icon-sm" aria-label={canEdit ? "Ubah" : "Lihat"} nativeButton={false} render={<Link href={`/kontrak/${r.id}`} />}>
        {canEdit ? <Pencil /> : <Eye />}
      </Button>
      {canEdit && <ConfirmDelete title={`Hapus kontrak ${r.billToName} (${fmtDate(r.date) || "tanpa tanggal"})?`} onConfirm={() => deleteKontrak(r.id)} />}
    </>
  );
  const columns: ColumnDef<KontrakRow, unknown>[] = [
    { id: "date", accessorKey: "date", meta: { label: "Tanggal" }, header: ({ column }) => <SortHeader column={column} title="Tanggal" />,
      cell: ({ row }) => <span className="whitespace-nowrap">{fmtDate(row.original.date) || "—"}</span> },
    { id: "billToName", accessorKey: "billToName", meta: { label: "Bill To" }, header: ({ column }) => <SortHeader column={column} title="Bill To" />,
      cell: ({ row }) => <Link href={`/kontrak/${row.original.id}`} className="font-medium text-primary hover:underline">{row.original.billToName}</Link> },
    { id: "nomor", accessorKey: "nomor", meta: { label: "Nomor" }, header: "Nomor", enableSorting: false },
    { id: "itemCount", accessorKey: "itemCount", meta: { label: "Item Harga" }, header: ({ column }) => <SortHeader column={column} title="Item Harga" />,
      cell: ({ row }) => <span className="tabular-nums">{row.original.itemCount}</span> },
    { id: "actions", header: "", enableHiding: false, enableSorting: false, cell: ({ row }) => <div className="flex justify-end gap-1">{actions(row.original)}</div> },
  ];
  return (
    <DataTable
      columns={columns}
      data={list.data}
      total={list.total}
      page={list.page}
      pageSize={list.pageSize}
      searchPlaceholder="Cari bill to, nomor kontrak…"
      toolbar={canEdit && <Button nativeButton={false} render={<Link href="/kontrak/new" />}><Plus /> Insert</Button>}
      renderCard={(r) => (
        <RecordCard
          title={<Link href={`/kontrak/${r.id}`} className="text-primary hover:underline">{r.billToName}</Link>}
          fields={[["Tanggal", fmtDate(r.date)], ["Nomor", r.nomor], ["Item Harga", String(r.itemCount)]]}
          actions={actions(r)}
        />
      )}
    />
  );
}
