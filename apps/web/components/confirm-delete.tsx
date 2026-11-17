"use client";

import { useState, useTransition, type ReactElement, type ReactNode } from "react";
import { Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type Result = { ok: boolean; error?: string };

/**
 * Tombol hapus dengan peringatan Yes / No. Dipakai untuk semua tombol hapus/keluarkan:
 * - `onConfirm` mengembalikan Promise<Result> (hapus di server) → toast sukses / pesan error dari API;
 * - `onConfirm` tanpa hasil (hapus baris di form yang belum disimpan) → dialog langsung ditutup.
 * `trigger` mengganti tombol bawaan (ikon tempat sampah), `children` isi tombol itu.
 */
export function ConfirmDelete({ title, description = "Data yang dihapus tidak bisa dikembalikan.", onConfirm, trigger, children }: {
  title: string;
  description?: ReactNode;
  onConfirm: () => Promise<Result> | void;
  trigger?: ReactElement;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={trigger ?? <Button variant="ghost" size="icon-sm" aria-label="Hapus" className="text-destructive" />}>
        {children ?? <Trash2 />}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive"><TriangleAlert /></AlertDialogMedia>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>No</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending}
            onClick={() => {
              const res = onConfirm();
              if (!res) { setOpen(false); return; }
              start(async () => {
                const r = await res;
                if (r.ok) { toast.success("Data dihapus."); setOpen(false); } else toast.error(r.error ?? "Gagal menghapus.");
              });
            }}>
            {pending ? "Menghapus…" : "Yes, hapus"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
