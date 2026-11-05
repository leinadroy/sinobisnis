"use client";

import { FileDown, Files, Printer } from "lucide-react";
import type { InvoicePrintModel } from "@sml/shared";
import { Button } from "@/components/ui/button";

/** Tombol cetak (dialog browser) dan unduh PDF dari server: invoice saja, atau invoice + semua lampiran (dengan bookmark). */
export function PrintToolbar({ invoiceId, model, attachmentCount }: { invoiceId: number; model: InvoicePrintModel; attachmentCount: number }) {
  const pdf = `/bff/invoices/${invoiceId}/pdf`;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 p-3 print:hidden">
      <Button onClick={() => window.print()}><Printer /> Print</Button>
      <Button variant="outline" nativeButton={false} render={<a href={pdf} target="_blank" rel="noopener" />}><FileDown /> PDF Invoice</Button>
      <Button variant="outline" nativeButton={false} disabled={!attachmentCount}
        render={<a href={`${pdf}?attachments=1`} target="_blank" rel="noopener" aria-disabled={!attachmentCount} />}>
        <Files /> PDF Invoice + Lampiran ({attachmentCount})
      </Button>
      <Button variant="ghost" onClick={() => window.close()}>Tutup</Button>
      <span className="w-full text-center text-xs text-muted-foreground">Model cetakan: {model} (dari nomor invoice)</span>
    </div>
  );
}
