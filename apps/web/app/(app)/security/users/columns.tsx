"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil } from "lucide-react";
import type { UserRow } from "@sml/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SortHeader } from "@/components/data-table/column-header";
import { ConfirmDelete } from "@/components/confirm-delete";
import { deleteUser } from "./actions";

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-";

export function userColumns(canEdit: boolean, meId: number): ColumnDef<UserRow, unknown>[] {
  return [
    { accessorKey: "fullname", header: ({ column }) => <SortHeader column={column} title="Fullname" />, meta: { label: "Fullname" }, enableHiding: false },
    { accessorKey: "username", header: ({ column }) => <SortHeader column={column} title="Username" />, meta: { label: "Username" } },
    {
      accessorKey: "isActive", header: ({ column }) => <SortHeader column={column} title="Is Active" />, meta: { label: "Is Active" },
      cell: ({ row }) => row.original.isActive ? <Badge variant="secondary">Aktif</Badge> : <Badge variant="destructive">Nonaktif</Badge>,
    },
    { accessorKey: "email", header: ({ column }) => <SortHeader column={column} title="Email" />, meta: { label: "Email" }, cell: ({ row }) => row.original.email ?? "-" },
    { accessorKey: "lastLogin", header: ({ column }) => <SortHeader column={column} title="Last Login" />, meta: { label: "Last Login" }, cell: ({ row }) => fmt(row.original.lastLogin) },
    { accessorKey: "roleName", header: ({ column }) => <SortHeader column={column} title="Role" />, meta: { label: "Role" }, cell: ({ row }) => row.original.roleName ?? "-" },
    {
      id: "actions", header: "", enableHiding: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon-sm" aria-label={canEdit ? "Ubah" : "Lihat"} nativeButton={false}
            render={<Link href={`/security/users/${row.original.id}`} />}>
            <Pencil />
          </Button>
          {canEdit && row.original.id !== meId && (
            <ConfirmDelete title={`Hapus user ${row.original.username}?`} onConfirm={() => deleteUser(row.original.id)} />
          )}
        </div>
      ),
    },
  ];
}
