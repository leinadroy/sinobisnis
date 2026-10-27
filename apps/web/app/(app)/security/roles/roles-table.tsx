"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { KeyRound, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { SUPER_ROLE, type Paginated, type RoleRow } from "@sml/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/data-table/data-table";
import { RecordCard } from "@/components/data-table/record-card";
import { SortHeader } from "@/components/data-table/column-header";
import { ConfirmDelete } from "@/components/confirm-delete";
import { deleteRole, saveRole } from "./actions";

export function RolesTable({ list, canEdit, canAccess }: { list: Paginated<RoleRow>; canEdit: boolean; canAccess: boolean }) {
  const [editing, setEditing] = useState<{ id: number | null; name: string } | null>(null);
  const [pending, start] = useTransition();

  // Aksi per role dipakai bersama oleh baris tabel (desktop) dan kartu (HP).
  const actions = (r: RoleRow) => {
    const locked = r.name === SUPER_ROLE;
    return (
      <>
        {canAccess && (
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/security/role-access?role=${r.id}`} />}>
            <KeyRound /> Hak akses
          </Button>
        )}
        {canEdit && !locked && (
          <>
            <Button variant="ghost" size="icon-sm" aria-label="Ganti nama" onClick={() => setEditing({ id: r.id, name: r.name })}><Pencil /></Button>
            <ConfirmDelete title={`Hapus role ${r.name}?`} onConfirm={() => deleteRole(r.id)} />
          </>
        )}
      </>
    );
  };

  const columns: ColumnDef<RoleRow, unknown>[] = [
    { accessorKey: "name", header: ({ column }) => <SortHeader column={column} title="Name" />, meta: { label: "Name" }, enableHiding: false },
    { accessorKey: "userCount", header: "Jumlah User", enableSorting: false },
    { id: "actions", header: "", enableHiding: false, cell: ({ row }) => <div className="flex justify-end gap-1">{actions(row.original)}</div> },
  ];

  const submit = () =>
    start(async () => {
      if (!editing) return;
      const res = await saveRole(editing.id, editing.name);
      if (!res.ok) return void toast.error(res.error);
      toast.success(editing.id ? "Role diperbarui." : "Role dibuat. Atur hak aksesnya di menu Hak Akses Role.");
      setEditing(null);
    });

  return (
    <>
      <DataTable
        columns={columns}
        data={list.data}
        total={list.total}
        page={list.page}
        pageSize={list.pageSize}
        searchPlaceholder="Cari role…"
        toolbar={canEdit && <Button onClick={() => setEditing({ id: null, name: "" })}><Plus /> Insert</Button>}
        renderCard={(r) => (
          <RecordCard
            title={r.name}
            badge={r.name === SUPER_ROLE ? <Badge variant="secondary">Akses penuh</Badge> : undefined}
            fields={[["Jumlah User", r.userCount]]}
            actions={actions(r)}
          />
        )}
      />
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Ganti nama role" : "Role baru"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <Field>
              <FieldLabel htmlFor="role-name">Name</FieldLabel>
              <Input id="role-name" autoFocus value={editing?.name ?? ""} onChange={(e) => setEditing((s) => s && { ...s, name: e.target.value })} />
            </Field>
            <DialogFooter className="mt-4">
              <Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
