"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Pencil, Plus } from "lucide-react";
import type { MasterEntity, MasterField, Paginated } from "@sml/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDelete } from "@/components/confirm-delete";
import { DataTable } from "@/components/data-table/data-table";
import { RecordCard, type CardField } from "@/components/data-table/record-card";
import { SortHeader } from "@/components/data-table/column-header";
import { fmtMoney } from "@/lib/format";
import { deleteMaster } from "./actions";

type Row = Record<string, unknown> & { id: number };

export function MasterTable({ entity, list, canEdit }: { entity: MasterEntity; list: Paginated<Row>; canEdit: boolean }) {
  const fields = entity.fields.filter((f) => f.list ?? f.type !== "textarea");
  const titleField = entity.fields.find((f) => f.name === entity.titleField)!;

  /** Nilai tampilan satu field (dipakai sel tabel dan kartu HP). */
  const display = (f: MasterField, r: Row): React.ReactNode => {
    const v = r[f.listField ?? f.name];
    if (f.type === "checkbox") return v ? <Badge variant="secondary">Ya</Badge> : <span className="text-muted-foreground">-</span>;
    if (v === null || v === undefined || v === "") return "";
    if (f.type === "number") return <span className="tabular-nums">{fmtMoney(Number(v))}</span>;
    return String(v);
  };

  const actions = (r: Row) => (
    <>
      <Button variant="ghost" size="icon-sm" aria-label={canEdit ? "Ubah" : "Lihat"} nativeButton={false}
        render={<Link href={`/master/${entity.slug}/${r.id}`} />}>
        {canEdit ? <Pencil /> : <Eye />}
      </Button>
      {canEdit && (
        <ConfirmDelete title={`Hapus ${entity.title} "${String(r[entity.titleField] ?? r.id)}"?`}
          onConfirm={() => deleteMaster(entity.slug, r.id)} />
      )}
    </>
  );

  const columns: ColumnDef<Row, unknown>[] = [
    ...fields.map((f): ColumnDef<Row, unknown> => ({
      id: f.name,
      accessorFn: (r) => r[f.listField ?? f.name],
      header: f.sortable ? ({ column }) => <SortHeader column={column} title={f.label} /> : f.label,
      meta: { label: f.label },
      enableSorting: !!f.sortable,
      cell: ({ row }) => <span className={f.name === entity.titleField ? "font-medium" : ""}>{display(f, row.original)}</span>,
    })),
    {
      id: "actions", header: "", enableHiding: false, enableSorting: false,
      cell: ({ row }) => <div className="flex justify-end gap-1">{actions(row.original)}</div>,
    },
  ];
  return (
    <DataTable
      columns={columns}
      data={list.data}
      total={list.total}
      page={list.page}
      pageSize={list.pageSize}
      searchPlaceholder={`Cari ${entity.title.toLowerCase()}…`}
      toolbar={canEdit && (
        <Button nativeButton={false} render={<Link href={`/master/${entity.slug}/new`} />}><Plus /> Insert</Button>
      )}
      renderCard={(r) => (
        <RecordCard
          title={<Link href={`/master/${entity.slug}/${r.id}`} className="text-primary hover:underline">{display(titleField, r) || `#${r.id}`}</Link>}
          fields={fields.filter((f) => f.name !== entity.titleField).map((f): CardField => [f.label, display(f, r)])}
          actions={actions(r)}
        />
      )}
    />
  );
}
