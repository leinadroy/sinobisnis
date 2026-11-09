"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, History, Pencil, Plus } from "lucide-react";
import type { Paginated, PersonRow } from "@sml/shared";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table/data-table";
import { RecordCard } from "@/components/data-table/record-card";
import { SortHeader } from "@/components/data-table/column-header";
import { fmtDate } from "@/lib/format";

export function PeopleTable({ list, canCreate }: { list: Paginated<PersonRow>; canCreate: boolean }) {
  const actions = (p: PersonRow, withEdit = false) => (
    <>
      {withEdit && canCreate && (
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/clients/${p.lastId}?mode=update`} />}>
          <Pencil /> Update
        </Button>
      )}
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

  // Detail / Update membuka permohonan terakhir orang ini (lastId).
  const columns: ColumnDef<PersonRow, unknown>[] = [
    { id: "edit", header: "", enableHiding: false, enableSorting: false, cell: ({ row }) => (
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon-xs" aria-label="Detail" title="Client Detail (permohonan terakhir)" nativeButton={false} render={<Link href={`/clients/${row.original.lastId}`} />}><Eye /></Button>
        {canCreate && (
          <Button variant="ghost" size="icon-xs" aria-label="Update" title="Update (permohonan terakhir)" nativeButton={false} render={<Link href={`/clients/${row.original.lastId}?mode=update`} />}><Pencil /></Button>
        )}
      </div>
    ) },
    { id: "name", accessorKey: "name", header: ({ column }) => <SortHeader column={column} title="Name" />, meta: { label: "Name" }, enableHiding: false,
      cell: ({ row }) => <Link href={`/clients/${row.original.lastId}`} className="font-medium text-primary hover:underline">{row.original.name}</Link> },
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
          fields={[["Tanggal Lahir", fmtDate(p.tanggalLahir)], ["Jumlah Permohonan", p.jumlah]]} actions={actions(p, true)} />
      )} />
  );
}
