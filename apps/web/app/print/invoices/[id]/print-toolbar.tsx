"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintToolbar() {
  return (
    <div className="flex justify-center gap-2 p-3 print:hidden">
      <Button onClick={() => window.print()}><Printer /> Print / Simpan PDF</Button>
      <Button variant="outline" onClick={() => window.close()}>Tutup</Button>
    </div>
  );
}
