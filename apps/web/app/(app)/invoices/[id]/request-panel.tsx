"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, Unlock, X } from "lucide-react";
import { toast } from "sonner";
import type { InvoiceDetail } from "@sml/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { fmtDate } from "@/lib/format";
import { cancelRequest, decideRequest, requestEdit } from "../actions";
import { RequestStatusBadge } from "../status-badge";

/** Tombol Request To Edit / Cancel Request / Approve / Reject di bar aksi form invoice. */
export function RequestActions({ detail, canEdit, canApprove }: { detail: InvoiceDetail; canEdit: boolean; canApprove: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const last = detail.requests[0];
  const open_ = last && (last.status === "PENDING" || last.status === "APPROVED");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => start(async () => {
    const res = await fn();
    if (!res.ok) return void toast.error(res.error);
    toast.success(msg);
    setOpen(false);
    router.refresh();
  });

  if (detail.status === "DRAFT") return null;
  return (
    <>
      {canEdit && !open_ && (
        <Button variant="secondary" className="bg-orange-100 text-orange-900 hover:bg-orange-200" onClick={() => { setReason(""); setOpen(true); }}>
          <Unlock /> Request To Edit
        </Button>
      )}
      {canEdit && open_ && (
        <Button variant="outline" disabled={pending} onClick={() => run(() => cancelRequest(detail.id), "Request edit dibatalkan.")}>
          <Ban /> Cancel Request
        </Button>
      )}
      {canApprove && last?.status === "PENDING" && (
        <>
          <Button variant="outline" className="border-green-300 text-green-800" disabled={pending}
            onClick={() => run(() => decideRequest(last.id, detail.id, true), "Request disetujui.")}><Check /> Approve</Button>
          <Button variant="outline" className="border-red-300 text-red-700" disabled={pending}
            onClick={() => run(() => decideRequest(last.id, detail.id, false), "Request ditolak.")}><X /> Reject</Button>
        </>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request To Edit</DialogTitle>
            <DialogDescription>Invoice {detail.no} berstatus {detail.status}. Setelah disetujui, invoice bisa diubah satu kali.</DialogDescription>
          </DialogHeader>
          <Textarea rows={3} placeholder="Alasan perubahan (opsional, untuk penyetuju)" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus aria-label="Alasan request edit" />
          <p className="text-xs text-muted-foreground">Database lama tidak menyimpan alasan; sampaikan juga ke penyetuju bila penting.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button disabled={pending} onClick={() => run(() => requestEdit(detail.id, reason), "Request edit dikirim, menunggu persetujuan.")}>Kirim</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RequestHistory({ detail }: { detail: InvoiceDetail }) {
  if (!detail.requests.length) return null;
  return (
    <Card>
      <CardHeader><CardTitle>Riwayat Update Request</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Tanggal</TableHead><TableHead>Oleh</TableHead><TableHead>Status</TableHead><TableHead>Diperbarui</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {detail.requests.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{fmtDate(r.createdAt)}</TableCell>
                <TableCell>{r.requestedBy}</TableCell>
                <TableCell><RequestStatusBadge status={r.status} /></TableCell>
                <TableCell className="whitespace-nowrap">{fmtDate(r.updatedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
