"use client";

import { FileDown, Printer } from "lucide-react";
import type { ReminderType } from "@sml/shared";
import { Button } from "@/components/ui/button";

/** Tombol cetak (dialog browser) dan unduh PDF dari server untuk daftar reminder. */
export function ReminderPrintToolbar({ type }: { type: ReminderType | null }) {
  const pdf = `/bff/reminders/pdf${type ? `?type=${type}` : ""}`;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 p-3 print:hidden">
      <Button onClick={() => window.print()}><Printer /> Print</Button>
      <Button variant="outline" nativeButton={false} render={<a href={pdf} target="_blank" rel="noopener" />}><FileDown /> Unduh PDF</Button>
      <Button variant="ghost" onClick={() => window.close()}>Tutup</Button>
    </div>
  );
}
