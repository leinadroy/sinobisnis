"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { KontrakInput, MasterOptions } from "@sml/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDelete } from "@/components/confirm-delete";
import { deleteKontrak, saveKontrak } from "./actions";

type ItemState = { key: number; keperluanId: string; description: string; duration: string; price: string };
let seq = 0;
const newItem = (): ItemState => ({ key: ++seq, keperluanId: "", description: "", duration: "", price: "0" });

type Props = {
  id?: number;
  options: MasterOptions;
  canEdit: boolean;
  initial: Pick<KontrakInput, "date" | "billToId" | "alamat" | "isi"> & { items: KontrakInput["items"] };
};

export function KontrakForm({ id, options, canEdit, initial }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(initial.date ?? "");
  const [billToId, setBillToId] = useState(initial.billToId ? String(initial.billToId) : "");
  const [alamat, setAlamat] = useState(initial.alamat ?? "");
  const [isi, setIsi] = useState(initial.isi ?? "");
  const [items, setItems] = useState<ItemState[]>(() =>
    initial.items.length
      ? initial.items.map((i) => ({ key: ++seq, keperluanId: i.keperluanId ? String(i.keperluanId) : "", description: i.description, duration: i.duration ?? "", price: String(i.price) }))
      : [newItem()],
  );
  const setItem = (key: number, patch: Partial<ItemState>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const kepItems = [{ value: "", label: "— tanpa keperluan —" }, ...options.keperluan.filter((k) => k.isActive || items.some((i) => i.keperluanId === String(k.id))).map((k) => ({ value: String(k.id), label: k.name }))];
  const billTos = options.billTos.map((b) => ({ value: String(b.id), label: b.label }));

  const save = () => start(async () => {
    const res = await saveKontrak(id ?? null, {
      date: date || null, billToId: Number(billToId), alamat: alamat.trim() || null, isi: isi.trim() || null,
      items: items.map((i) => ({ keperluanId: i.keperluanId ? Number(i.keperluanId) : null, description: i.description, duration: i.duration || null, price: Number(i.price.replace(",", ".")) || 0 })),
    });
    if (!res.ok) return void toast.error(res.error);
    toast.success(`Kontrak disimpan (${res.data!.items.length} item harga).`);
    if (!id) router.push(`/kontrak/${res.data!.id}`);
    else router.refresh();
  });

  return (
    <div className="space-y-4">
      <fieldset disabled={!canEdit || pending} className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Kontrak</CardTitle></CardHeader>
          <CardContent>
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="k-date">Tanggal Kontrak</FieldLabel>
                <Input id="k-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                <FieldDescription>Berlaku untuk invoice bertanggal sama atau sesudahnya.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="k-billto">Bill To<span className="text-destructive">*</span></FieldLabel>
                <Select items={billTos} value={billToId} onValueChange={(v) => setBillToId(v ?? "")}>
                  <SelectTrigger id="k-billto" className="w-full"><SelectValue placeholder="== Please Select ==" /></SelectTrigger>
                  <SelectContent>{billTos.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="k-alamat">Alamat</FieldLabel>
                <Input id="k-alamat" value={alamat} onChange={(e) => setAlamat(e.target.value)} placeholder="Kosongkan untuk memakai alamat Bill To" />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="k-isi">Isi Kontrak</FieldLabel>
                <Textarea id="k-isi" rows={4} value={isi} onChange={(e) => setIsi(e.target.value)} />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Harga</CardTitle>
            <p className="text-sm text-muted-foreground">Pilih Keperluan supaya harga otomatis terpakai saat Create Invoice. Nama layanan kosong = nama Keperluan.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="hidden grid-cols-[14rem_minmax(0,1fr)_9rem_10rem_2rem] gap-2 text-xs font-medium text-muted-foreground md:grid">
              <span>Keperluan</span><span>Nama Layanan</span><span>Duration</span><span>Price</span><span />
            </div>
            {items.map((i) => (
              <div key={i.key} className="grid grid-cols-2 gap-2 rounded-md border p-2 md:grid-cols-[14rem_minmax(0,1fr)_9rem_10rem_2rem] md:items-center md:rounded-none md:border-0 md:p-0">
                <Select items={kepItems} value={i.keperluanId} onValueChange={(v) => setItem(i.key, { keperluanId: v ?? "" })}>
                  <SelectTrigger className="col-span-2 w-full md:col-span-1" aria-label="Keperluan"><SelectValue placeholder="— tanpa keperluan —" /></SelectTrigger>
                  <SelectContent>{kepItems.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
                </Select>
                <Input className="col-span-2 md:col-span-1" aria-label="Nama Layanan" value={i.description} onChange={(e) => setItem(i.key, { description: e.target.value })}
                  placeholder={options.keperluan.find((k) => String(k.id) === i.keperluanId)?.name ?? "mis. Additional Photo"} />
                <Input aria-label="Duration" value={i.duration} onChange={(e) => setItem(i.key, { duration: e.target.value })} placeholder="mis. 12 bulan" />
                <Input aria-label="Price" inputMode="decimal" value={i.price} onChange={(e) => setItem(i.key, { price: e.target.value })} />
                {canEdit ? (
                  <Button variant="ghost" size="icon-sm" aria-label="Hapus item" className="justify-self-end text-destructive" onClick={() => setItems((xs) => xs.filter((x) => x.key !== i.key))}><X /></Button>
                ) : <span />}
              </div>
            ))}
            {canEdit && <Button variant="outline" size="sm" onClick={() => setItems((xs) => [...xs, newItem()])}><Plus /> Add Item</Button>}
          </CardContent>
        </Card>
      </fieldset>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t bg-background py-3">
        {canEdit && <Button onClick={save} disabled={pending || !billToId}>{pending ? "Menyimpan…" : "Save"}</Button>}
        <Button variant="outline" nativeButton={false} render={<Link href="/kontrak" />}>Back To List</Button>
        {id && canEdit && (
          <span className="ml-auto">
            <ConfirmDelete title="Hapus kontrak ini?" description="Daftar harganya tidak lagi dipakai untuk invoice baru. Invoice yang sudah dibuat tidak berubah."
              onConfirm={async () => { const r = await deleteKontrak(id); if (r.ok) router.push("/kontrak"); return r; }} />
          </span>
        )}
      </div>
    </div>
  );
}
