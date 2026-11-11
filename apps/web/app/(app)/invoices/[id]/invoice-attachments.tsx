"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, ExternalLink, Paperclip, Upload } from "lucide-react";
import { toast } from "sonner";
import type { InvoiceAttachmentRow } from "@sml/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDelete } from "@/components/confirm-delete";
import { fmtDateTime, fmtSize } from "@/lib/format";
import { deleteInvoiceAttachment } from "../actions";

/** Lampiran invoice; tambah/hapus hanya saat invoice bisa diedit (API juga menolak bila terkunci). */
export function InvoiceAttachments({ invoiceId, attachments, editable }: { invoiceId: number; attachments: InvoiceAttachmentRow[]; editable: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const tooBig = [...files].find((f) => f.size > 20 * 1024 * 1024);
    if (tooBig) return void toast.error(`${tooBig.name} lebih dari 20 MB.`);
    setUploading(true);
    const picked = [...files];
    const fd = new FormData();
    picked.forEach((f) => fd.append("files", f));
    const res = await fetch(`/bff/invoices/${invoiceId}/attachments`, { method: "POST", body: fd }).catch(() => null);
    setUploading(false);
    if (input.current) input.current.value = "";
    if (!res?.ok) {
      const body = await res?.json().catch(() => null);
      return void toast.error(body?.message ?? "Upload gagal.");
    }
    toast.success(`${picked.length} lampiran diunggah.`);
    router.refresh();
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Paperclip className="size-4" /> Attachment ({attachments.length})</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {attachments.length === 0 && <p className="text-sm text-muted-foreground">Belum ada lampiran.</p>}
        <ul className="divide-y text-sm">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-2 py-2">
              <a href={`/bff/invoices/attachments/${a.id}`} target="_blank" rel="noopener noreferrer" title="Buka di tab baru" className="flex min-w-0 flex-1 items-center gap-2 text-primary hover:underline">
                <ExternalLink className="size-3.5 shrink-0" /> <span className="truncate">{a.originalName}</span>
              </a>
              <a href={`/bff/invoices/attachments/${a.id}?download=1`} title="Download" aria-label={`Download ${a.originalName}`} className="shrink-0 text-muted-foreground hover:text-foreground">
                <Download className="size-3.5" />
              </a>
              <span className="shrink-0 text-xs text-muted-foreground">{fmtSize(a.size)} · {fmtDateTime(a.uploadedAt)}</span>
              {editable && <ConfirmDelete title={`Hapus lampiran ${a.originalName}?`} onConfirm={() => deleteInvoiceAttachment(invoiceId, a.id)} />}
            </li>
          ))}
        </ul>
        {editable && (
          <>
            <input ref={input} type="file" multiple hidden onChange={(e) => upload(e.target.files)} aria-label="Pilih file lampiran" />
            <Button variant="outline" size="sm" disabled={uploading} onClick={() => input.current?.click()}>
              <Upload /> {uploading ? "Mengunggah…" : "(+) Add Attachment"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
