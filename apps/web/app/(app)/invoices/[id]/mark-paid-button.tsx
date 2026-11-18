"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { markInvoicePaid } from "../actions";

export function MarkPaidButton({ id, no }: { id: number; no: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="outline" disabled={pending} />}>
        <CircleCheck /> Mark as PAID
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark invoice {no ?? `#${id}`} as PAID?</AlertDialogTitle>
          <AlertDialogDescription>Status invoice menjadi PAID dan tanggal pembayaran diisi hari ini.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>No</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={() => start(async () => {
            const result = await markInvoicePaid(id);
            if (!result.ok) return void toast.error(result.error);
            setOpen(false);
            toast.success("Invoice berhasil ditandai PAID.");
            router.refresh();
          })}>{pending ? "Menyimpan…" : "Yes"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
