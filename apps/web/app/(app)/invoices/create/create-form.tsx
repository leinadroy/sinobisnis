"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FilePlus2, Search } from "lucide-react";
import { toast } from "sonner";
import type { InvoiceableClientRow, MasterOptions } from "@sml/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/ui/search-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/format";
import { createInvoice } from "../actions";
import { CREATE_FILTER_KEYS, type CreateFilterKey } from "../filters";

type Item = { value: string; label: string };

function Pick({ id, label, items, value, onChange, placeholder }: {
  id: string; label: string; items: Item[]; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <SearchSelect items={items} value={value} onValueChange={(v) => onChange(v ?? "")} id={id} className="w-full" placeholder={placeholder} />
    </div>
  );
}

export function CreateInvoiceForm({ clients, options, canEdit }: { clients: InvoiceableClientRow[]; options: MasterOptions; canEdit: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [searching, startSearch] = useTransition();
  const [creating, startCreate] = useTransition();

  // ---- filter (disimpan di URL) ----
  const [f, setF] = useState<Record<CreateFilterKey, string>>(() => Object.fromEntries(CREATE_FILTER_KEYS.map((k) => [k, params.get(k) ?? ""])) as Record<CreateFilterKey, string>);
  const setFilter = (k: CreateFilterKey, v: string) => setF((s) => ({ ...s, [k]: v, ...(k === "sponsorId" ? { projectId: "" } : {}) }));
  const apply = (values = f) => {
    const next = new URLSearchParams();
    CREATE_FILTER_KEYS.forEach((k) => values[k] && next.set(k, values[k]));
    startSearch(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  const projects = options.projects.filter((p) => !f.sponsorId || String(p.sponsorId) === f.sponsorId);

  // ---- pilihan client (yang tidak ada di hasil pencarian saat ini otomatis tidak ikut) ----
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const toggle = (id: number, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const allOn = clients.length > 0 && clients.every((c) => selected.has(c.id));
  const picked = clients.filter((c) => selected.has(c.id));
  const sponsors = new Set(picked.map((c) => c.sponsorId ?? 0));

  // ---- company & bill to ----
  const [companyId, setCompanyId] = useState(options.companies.length === 1 ? String(options.companies[0].id) : "");
  const [billToId, setBillToId] = useState("");
  const suggestedBillTo = useMemo(() => picked.find((c) => c.billToId)?.billToId ?? null, [picked]);
  const effectiveBillTo = billToId || (suggestedBillTo ? String(suggestedBillTo) : "");

  const submit = () => startCreate(async () => {
    const res = await createInvoice({ clientIds: picked.map((c) => c.id), companyId: Number(companyId), billToId: effectiveBillTo ? Number(effectiveBillTo) : null });
    if (!res.ok) return void toast.error(res.error);
    const { id, no, missingPrice } = res.data!;
    if (missingPrice) toast.warning(`Invoice ${no} dibuat (DRAFT). ${missingPrice} grup belum punya harga — isi manual.`, { duration: 8000 });
    else toast.success(`Invoice ${no} dibuat (DRAFT). Harga diambil dari Kontrak / harga default Keperluan.`);
    router.push(`/invoices/${id}`);
  });

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); apply(); }} className="grid grid-cols-1 gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-5">
        <Pick id="c-sponsor" label="Sponsor" value={f.sponsorId} onChange={(v) => setFilter("sponsorId", v)}
          items={[{ value: "", label: "Semua sponsor" }, ...options.sponsors.map((s) => ({ value: String(s.id), label: s.name }))]} />
        <Pick id="c-project" label="Project" value={f.projectId} onChange={(v) => setFilter("projectId", v)}
          items={[{ value: "", label: "Semua project" }, ...projects.map((p) => ({ value: String(p.id), label: p.name }))]} />
        <Pick id="c-billto" label="Bill To (project)" value={f.billToId} onChange={(v) => setFilter("billToId", v)}
          items={[{ value: "", label: "Semua bill to" }, ...options.billTos.map((b) => ({ value: String(b.id), label: b.label }))]} />
        <div className="space-y-1">
          <Label htmlFor="c-search" className="text-xs text-muted-foreground">Nama / No Paspor</Label>
          <Input id="c-search" value={f.search} onChange={(e) => setFilter("search", e.target.value)} placeholder="Cari…" />
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit" disabled={searching}><Search /> Search</Button>
          <Button type="button" variant="outline" disabled={searching} onClick={() => {
            const empty = Object.fromEntries(CREATE_FILTER_KEYS.map((k) => [k, ""])) as Record<CreateFilterKey, string>;
            setF(empty);
            apply(empty);
          }}>Clear</Button>
        </div>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Client belum ber-invoice ({clients.length}{clients.length >= 500 ? "+, persempit pencarian" : ""})</CardTitle>
        </CardHeader>
        <CardContent className={`transition-opacity ${searching ? "opacity-60" : ""}`}>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox aria-label="Pilih semua" checked={allOn} disabled={!clients.length}
                      onCheckedChange={(on) => setSelected(on ? new Set(clients.map((c) => c.id)) : new Set())} />
                  </TableHead>
                  <TableHead>No</TableHead>
                  <TableHead>Nama Client</TableHead>
                  <TableHead>No Paspor</TableHead>
                  <TableHead>Sponsor</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Keperluan</TableHead>
                  <TableHead>Permohonan</TableHead>
                  <TableHead>Proses Selesai</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.length ? clients.map((c) => (
                  <TableRow key={c.id} data-state={selected.has(c.id) ? "selected" : undefined} className="cursor-pointer" onClick={() => toggle(c.id, !selected.has(c.id))}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox aria-label={`Pilih ${c.name}`} checked={selected.has(c.id)} onCheckedChange={(on) => toggle(c.id, !!on)} />
                    </TableCell>
                    <TableCell className="tabular-nums">{c.id}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.noPaspor}</TableCell>
                    <TableCell>{c.sponsorName}</TableCell>
                    <TableCell>{c.projectName}</TableCell>
                    <TableCell>{c.keperluanName}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(c.tanggalPermohonan)}</TableCell>
                    <TableCell className="whitespace-nowrap">{c.tanggalProsesSelesai ? fmtDate(c.tanggalProsesSelesai) : <span className="text-muted-foreground">belum</span>}</TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={9} className="h-20 text-center text-muted-foreground">Tidak ada client yang belum ber-invoice untuk filter ini.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {canEdit && (
        <div className="sticky bottom-0 z-10 grid gap-3 border-t bg-background py-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Pick id="c-company" label="Company (nomor invoice) *" value={companyId} onChange={setCompanyId} placeholder="== Please Select =="
            items={options.companies.map((c) => ({ value: String(c.id), label: c.name }))} />
          <Pick id="c-invbillto" label={`Bill To invoice${suggestedBillTo && !billToId ? " (dari project)" : ""}`} value={effectiveBillTo} onChange={setBillToId} placeholder="== Please Select =="
            items={options.billTos.map((b) => ({ value: String(b.id), label: b.label }))} />
          <div className="space-y-1">
            {sponsors.size > 1 && <p className="text-xs text-amber-700">Client dari {sponsors.size} sponsor berbeda — sponsor invoice diambil dari client pertama.</p>}
            <Button onClick={submit} disabled={creating || !picked.length || !companyId} className="w-full sm:w-auto">
              <FilePlus2 /> {creating ? "Membuat…" : `Create Invoice (${picked.length} client)`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
