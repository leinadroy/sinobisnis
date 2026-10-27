"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { History, Plus } from "lucide-react";
import type { Paginated, PersonRow } from "@sml/shared";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table/data-table";
import { RecordCard } from "@/components/data-table/record-card";
import { SortHeader } from "@/components/data-table/column-header";
import { fmtDate } from "@/lib/format";

export function PeopleTable({ list, canCreate }: { list: Paginated<PersonRow>; canCreate: boolean }) {
  const actions = (p: PersonRow) => (
    <>
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/clients?search=${encodeURIComponent(p.noPaspor || p.name)}`} />}>
        <History /> Riwayat
      </Button>
      {canCreate && (
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/clients/new?copy=${p.lastId}`} />}>
          <Plus /> Permohonan baru
        </Button>
      )}
    </>
  );

  const columns: ColumnDef<PersonRow, unknown>[] = [
    { id: "name", accessorKey: "name", header: ({ column }) => <SortHeader column={column} title="Name" />, meta: { label: "Name" }, enableHiding: false,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { id: "noPaspor", accessorKey: "noPaspor", header: ({ column }) => <SortHeader column={column} title="No Paspor" />, meta: { label: "No Paspor" } },
    { id: "tanggalLahir", accessorKey: "tanggalLahir", header: "Tanggal Lahir", enableSorting: false, cell: ({ row }) => fmtDate(row.original.tanggalLahir) },
    { id: "jumlah", accessorKey: "jumlah", header: ({ column }) => <SortHeader column={column} title="Jumlah Permohonan" />, meta: { label: "Jumlah Permohonan" } },
    { id: "actions", header: "", enableHiding: false, enableSorting: false, cell: ({ row }) => <div className="flex justify-end gap-1">{actions(row.original)}</div> },
  ];
  return (
    <DataTable columns={columns} data={list.data} total={list.total} page={list.page} pageSize={list.pageSize}
      searchPlaceholder="Cari nama / no paspor…"
      renderCard={(p) => (
        <RecordCard title={p.name} subtitle={p.noPaspor ?? undefined}
          fields={[["Tanggal Lahir", fmtDate(p.tanggalLahir)], ["Jumlah Permohonan", p.jumlah]]} actions={actions(p)} />
      )} />
  );
}
