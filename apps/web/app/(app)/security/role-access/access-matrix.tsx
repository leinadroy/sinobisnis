"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { AccessMap, MatrixItem } from "@sml/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { saveRoleAccess } from "./actions";

type Props = { roleId: number; items: MatrixItem[]; initial: AccessMap; canEdit: boolean; isSuperRole: boolean };

export function AccessMatrix({ roleId, items, initial, canEdit, isSuperRole }: Props) {
  const router = useRouter();
  const [access, setAccess] = useState<AccessMap>(initial);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(access) !== JSON.stringify(initial);
  const groups = useMemo(() => [...new Set(items.map((i) => i.group))], [items]);

  // Edit menyiratkan Lihat; mencabut Lihat juga mencabut Edit.
  const set = (key: string, field: "view" | "edit", value: boolean) =>
    setAccess((a) => {
      const cur = a[key] ?? { view: false, edit: false };
      const next = field === "edit" ? { view: value || cur.view, edit: value } : { view: value, edit: value && cur.edit };
      const copy = { ...a };
      if (next.view) copy[key] = next; else delete copy[key];
      return copy;
    });
  const setAll = (field: "view" | "edit", value: boolean) => items.forEach((i) => set(i.key, field, value));
  const allOn = (field: "view" | "edit") => items.every((i) => access[i.key]?.[field]);

  const save = () =>
    start(async () => {
      const res = await saveRoleAccess(roleId, access);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Hak akses disimpan." + (isSuperRole ? " Role Developer tetap punya akses penuh." : ""));
      router.refresh();
    });

  const disabled = !canEdit || pending;
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Menu</TableHead>
              <TableHead className="w-28 text-center">
                <label className="inline-flex items-center gap-2">Lihat <Checkbox disabled={disabled} checked={allOn("view")} onCheckedChange={(v) => setAll("view", !!v)} aria-label="Lihat semua" /></label>
              </TableHead>
              <TableHead className="w-28 text-center">
                <label className="inline-flex items-center gap-2">Edit <Checkbox disabled={disabled} checked={allOn("edit")} onCheckedChange={(v) => setAll("edit", !!v)} aria-label="Edit semua" /></label>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => (
              <Fragment key={g || "root"}>
                {g && (
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={3} className="py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g}</TableCell>
                  </TableRow>
                )}
                {items.filter((i) => i.group === g).map((i) => (
                  <TableRow key={i.key}>
                    <TableCell className={g ? "pl-6" : ""}>{i.label}</TableCell>
                    <TableCell className="text-center">
                      <Checkbox disabled={disabled} checked={!!access[i.key]?.view} onCheckedChange={(v) => set(i.key, "view", !!v)} aria-label={`Lihat ${i.label}`} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox disabled={disabled} checked={!!access[i.key]?.edit} onCheckedChange={(v) => set(i.key, "edit", !!v)} aria-label={`Edit ${i.label}`} />
                    </TableCell>
                  </TableRow>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
      {canEdit && (
        <div className="sticky bottom-0 mt-4 flex items-center gap-3 border-t bg-background py-3">
          <Button onClick={save} disabled={pending || !dirty}>{pending ? "Menyimpan…" : "Save"}</Button>
          {dirty && <span className="text-sm text-muted-foreground">Ada perubahan yang belum disimpan.</span>}
        </div>
      )}
    </div>
  );
}
