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
import { DateInput } from "@/components/ui/date-input";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { markInvoicePaid } from "../actions";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function MarkPaidButton({ id, no }: { id: number; no: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [paidDate, setPaidDate] = useState("");
  const [pending, start] = useTransition();

  const valid = ISO.test(paidDate);

  return (
    <AlertDialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setPaidDate(""); }}>
      <AlertDialogTrigger render={<Button variant="outline" disabled={pending} />}>
        <CircleCheck /> Mark as PAID
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark invoice {no ?? `#${id}`} as PAID?</AlertDialogTitle>
          <AlertDialogDescription>Status invoice menjadi PAID dengan tanggal pembayaran di bawah ini.</AlertDialogDescription>
        </AlertDialogHeader>
        <Field>
          <FieldLabel htmlFor="markPaidDate">Paid Date<span className="text-destructive">*</span></FieldLabel>
          <DateInput id="markPaidDate" value={paidDate} onChange={setPaidDate} disabled={pending} autoFocus />
          <FieldDescription>Format dd/mm/yyyy.</FieldDescription>
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>No</AlertDialogCancel>
          <AlertDialogAction disabled={pending || !valid} onClick={() => start(async () => {
            const result = await markInvoicePaid(id, paidDate);
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
