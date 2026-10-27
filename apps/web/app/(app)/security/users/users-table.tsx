"use client";

import Link from "next/link";
import { Eye, Pencil, Plus } from "lucide-react";
import type { Paginated, UserRow } from "@sml/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDelete } from "@/components/confirm-delete";
import { DataTable } from "@/components/data-table/data-table";
import { RecordCard } from "@/components/data-table/record-card";
import { fmtDateTime } from "@/lib/format";
import { deleteUser } from "./actions";
import { userColumns } from "./columns";

export function UsersTable({ list, canEdit, meId }: { list: Paginated<UserRow>; canEdit: boolean; meId: number }) {
  return (
    <DataTable
      columns={userColumns(canEdit, meId)}
      data={list.data}
      total={list.total}
      page={list.page}
      pageSize={list.pageSize}
      searchPlaceholder="Cari nama, username, email, role…"
      toolbar={canEdit && (
        <Button nativeButton={false} render={<Link href="/security/users/new" />}>
          <Plus /> Insert
        </Button>
      )}
      renderCard={(u) => (
        <RecordCard
          title={<Link href={`/security/users/${u.id}`} className="text-primary hover:underline">{u.fullname}</Link>}
          subtitle={u.username}
          badge={u.isActive ? <Badge variant="secondary">Aktif</Badge> : <Badge variant="destructive">Nonaktif</Badge>}
          fields={[["Role", u.roleName ?? "-"], ["Email", u.email], ["Last Login", u.lastLogin ? fmtDateTime(u.lastLogin) : "-"]]}
          actions={
            <>
              <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/security/users/${u.id}`} />}>
                {canEdit ? <><Pencil /> Ubah</> : <><Eye /> Lihat</>}
              </Button>
              {canEdit && u.id !== meId && <ConfirmDelete title={`Hapus user ${u.username}?`} onConfirm={() => deleteUser(u.id)} />}
            </>
          }
        />
      )}
    />
  );
}
