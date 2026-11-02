"use client";

import { useEffect, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import type { InvoiceableClientRow, InvoiceGroupClientRow } from "@sml/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { searchInvoiceableClients } from "../actions";

/** Dialog pilih client yang belum ber-invoice untuk satu grup. `exclude` = client yang sudah ada di form. Pasang hanya saat dibuka. */
export function ClientPicker({ open, onOpenChange, sponsorId, exclude, onPick }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sponsorId: number | null;
  exclude: Set<number>;
  onPick: (clients: InvoiceGroupClientRow[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [onlySponsor, setOnlySponsor] = useState(true);
  const [rows, setRows] = useState<InvoiceableClientRow[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();

  const load = (sponsorOnly = onlySponsor) => start(async () => {
    const res = await searchInvoiceableClients({ search, sponsorId: sponsorOnly ? sponsorId : null });
    if (!res.ok) return void toast.error(res.error);
    setRows(res.data!);
  });

  // Komponen dipasang saat dialog dibuka (lihat InvoiceForm), jadi pilihan selalu mulai kosong.
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = rows.filter((r) => !exclude.has(r.id));
  const toggle = (id: number) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Pilih Client</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex flex-wrap items-center gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama / no paspor" className="min-w-48 flex-1" autoFocus />
          <Button type="submit" variant="outline" disabled={pending}><Search /> Cari</Button>
          {sponsorId && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={onlySponsor} onCheckedChange={(v) => { setOnlySponsor(!!v); load(!!v); }} /> hanya sponsor invoice ini
            </label>
          )}
        </form>
        <div className={`max-h-[50vh] overflow-y-auto rounded-lg border transition-opacity ${pending ? "opacity-60" : ""}`}>
          {visible.length === 0 && <p className="p-6 text-center text-muted-foreground">{pending ? "Memuat…" : "Tidak ada client belum ber-invoice."}</p>}
          <ul className="divide-y">
            {visible.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50">
                  <Checkbox checked={picked.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      #{c.id}{c.noPaspor && ` · ${c.noPaspor}`}{c.keperluanName && ` · ${c.keperluanName}`}{c.sponsorName && ` · ${c.sponsorName}`}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button disabled={!picked.size} onClick={() => {
            onPick(visible.filter((r) => picked.has(r.id)).map((r) => ({ id: r.id, name: r.name, noPaspor: r.noPaspor })));
            onOpenChange(false);
          }}>Pilih ({picked.size})</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
