"use client";

import { useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { computeExpired, type MasterOptions } from "@sml/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDelete } from "@/components/confirm-delete";
import { deleteClient, saveClient } from "./actions";
import { clientSchema, type ClientFormValues } from "./schema";

type Props = { id?: number; initial: ClientFormValues; options: MasterOptions; canEdit: boolean; invoiceId?: number | null };

const STATUS_OPTIONS = ["Proses", "Selesai", "Pending Dokumen", "Ditolak", "Batal"];

export function ClientForm({ id, initial, options, canEdit, invoiceId }: Props) {
  const isNew = id === undefined;
  const router = useRouter();
  const [pending, start] = useTransition();
  const form = useForm<ClientFormValues>({ resolver: zodResolver(clientSchema), defaultValues: initial });
  const { errors } = form.formState;
  const nextAction = useRef<"stay" | "new">("stay");

  // ---- Sponsor → Project ----
  const sponsorId = useWatch({ control: form.control, name: "sponsorId" });
  const projects = options.projects.filter((p) => String(p.sponsorId) === sponsorId);
  useEffect(() => {
    const pid = form.getValues("projectId");
    if (pid && !projects.some((p) => String(p.id) === pid)) form.setValue("projectId", "");
  }, [sponsorId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Expired Dokumen otomatis (sama dengan perhitungan API) ----
  const watched = useWatch({ control: form.control, name: ["keperluanId", "tanggalTerbitDokumen", "tanggalProsesSelesai", "tanggalMasukLastExp"] });
  const keperluan = options.keperluan.find((k) => String(k.id) === watched[0]);
  const auto = computeExpired(
    { tanggalTerbitDokumen: watched[1], tanggalProsesSelesai: watched[2], tanggalMasukLastExp: watched[3] },
    keperluan,
  );
  const autoMode = useRef(!initial.expiredDokumen);
  useEffect(() => {
    if (autoMode.current) form.setValue("expiredDokumen", auto ?? "", { shouldDirty: true });
  }, [auto]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const res = await saveClient(id ?? null, values);
      if (!res.ok) return void toast.error(res.error);
      toast.success(isNew ? `Client #${res.data!.id} berhasil disimpan.` : "Client berhasil diperbarui.");
      if (isNew && nextAction.current === "new") {
        form.reset({ ...initial, sponsorId: values.sponsorId, projectId: values.projectId });
        autoMode.current = true;
        router.refresh();
      } else if (isNew) router.push(`/clients/${res.data!.id}`);
      else router.refresh();
    }),
  );

  const sel = (name: keyof ClientFormValues, label: string, items: { value: string; label: string }[], placeholder = "== Please Select ==") => (
    <Field data-invalid={!!errors[name]}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Controller control={form.control} name={name} render={({ field }) => {
        const all = [{ value: "", label: "— kosong —" }, ...items];
        return (
          <Select items={all} value={String(field.value ?? "")} onValueChange={(v) => field.onChange(v ?? "")}>
            <SelectTrigger id={name} className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger>
            <SelectContent>{all.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
          </Select>
        );
      }} />
    </Field>
  );
  const text = (name: keyof ClientFormValues, label: string, opts: { type?: string; required?: boolean; list?: string; description?: string; placeholder?: string } = {}) => (
    <Field data-invalid={!!errors[name]}>
      <FieldLabel htmlFor={name}>{label}{opts.required && <span className="text-destructive">*</span>}</FieldLabel>
      <Input id={name} type={opts.type ?? "text"} list={opts.list} placeholder={opts.placeholder} aria-invalid={!!errors[name]} {...form.register(name)} />
      {opts.description && <FieldDescription>{opts.description}</FieldDescription>}
      <FieldError errors={[errors[name] as { message?: string } | undefined]} />
    </Field>
  );
  const grid = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";
  const isArchived = useWatch({ control: form.control, name: "isArchived" });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <fieldset disabled={!canEdit || pending} className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Data Permohonan</CardTitle></CardHeader>
          <CardContent>
            <FieldGroup className={grid}>
              <Field><FieldLabel>Client No</FieldLabel><Input value={isNew ? "(otomatis)" : String(id)} readOnly disabled /></Field>
              {text("tanggalPermohonan", "Tanggal Permohonan", { type: "date" })}
              {sel("sponsorId", "Client Sponsor", options.sponsors.map((s) => ({ value: String(s.id), label: s.name })))}
              {sel("projectId", "Client Project", projects.map((p) => ({ value: String(p.id), label: p.name })), sponsorId ? "== Please Select ==" : "Pilih sponsor dulu")}
              {text("name", "Nama Client", { required: true })}
              {text("noPaspor", "No Paspor")}
              {text("tanggalLahir", "Tanggal Lahir", { type: "date" })}
              {sel("keperluanId", "Keperluan", options.keperluan.filter((k) => k.isActive || String(k.id) === initial.keperluanId).map((k) => ({ value: String(k.id), label: k.name })))}
              {text("noRptka", "No RPTKA")}
              {text("pembayaranPnbp", "Client Pembayaran PNBP", { type: "date" })}
              {text("permohonanHariKe3", "Permohonan Hari Ke3")}
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Proses &amp; Dokumen</CardTitle></CardHeader>
          <CardContent>
            <FieldGroup className={grid}>
              {text("tanggalProsesSelesai", "Tanggal Proses Selesai", { type: "date" })}
              {text("tanggalTerbitDokumen", "Tanggal Terbit Dokumen", { type: "date" })}
              {text("tanggalMasukLastExp", "Tanggal Masuk Indo / Last Expired", { type: "date" })}
              <Field data-invalid={!!errors.expiredDokumen}>
                <FieldLabel htmlFor="expiredDokumen">Expired Dokumen</FieldLabel>
                <Input id="expiredDokumen" type="date" {...form.register("expiredDokumen", { onChange: (e) => { autoMode.current = !e.target.value; } })} />
                <FieldDescription>
                  {keperluan?.periode
                    ? <>Otomatis: {keperluan.sumberData.toLowerCase()} + {keperluan.periode} {keperluan.periodeIn === "DAYS" ? "hari" : "bulan"}. Kosongkan untuk menghitung ulang.</>
                    : "Isi manual (keperluan ini tidak punya periode)."}
                </FieldDescription>
              </Field>
              {text("epo", "EPO")}
              {text("prosesPerpanjangan", "Proses Perpanjangan", { placeholder: "isi bila sedang diperpanjang", description: "Selama terisi, reminder expired tidak dikirim." })}
              {text("sktt", "Client SKTT")}
              {text("stm", "Client STM")}
              {text("status", "Client Status", { list: "status-options" })}
              <datalist id="status-options">{STATUS_OPTIONS.map((s) => <option key={s} value={s} />)}</datalist>
              <Field className="sm:col-span-2 lg:col-span-3">
                <FieldLabel htmlFor="keteranganTka">Client Keterangan TKA</FieldLabel>
                <Textarea id="keteranganTka" rows={3} {...form.register("keteranganTka")} />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Invoice</CardTitle></CardHeader>
          <CardContent>
            <FieldGroup className={grid}>
              {text("noInvoice", "No Invoice", { description: invoiceId ? "Terhubung ke invoice; diperbarui otomatis dari modul Invoice." : undefined })}
              {text("tanggalInvoice", "Tanggal Invoice", { type: "date" })}
              {text("tanggalPembayaranInvoice", "Tanggal Pembayaran Invoice", { type: "date" })}
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Arsip</CardTitle></CardHeader>
          <CardContent>
            <FieldGroup className={grid}>
              <Field orientation="horizontal">
                <Controller control={form.control} name="isArchived" render={({ field }) => (
                  <Checkbox id="isArchived" checked={field.value} onCheckedChange={(v) => field.onChange(v)} />
                )} />
                <FieldLabel htmlFor="isArchived">Client Is Archived</FieldLabel>
              </Field>
              {isArchived && <div className="sm:col-span-2">{text("archivedReason", "Alasan Archive")}</div>}
            </FieldGroup>
          </CardContent>
        </Card>
      </fieldset>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t bg-background py-3">
        {canEdit && (
          <>
            <Button type="submit" disabled={pending} onClick={() => { nextAction.current = "stay"; }}>{pending ? "Menyimpan…" : "Save"}</Button>
            {isNew && <Button type="submit" variant="secondary" disabled={pending} onClick={() => { nextAction.current = "new"; }}>Save &amp; New</Button>}
          </>
        )}
        <Button variant="outline" nativeButton={false} render={<Link href={initial.isArchived ? "/clients/archived" : "/clients"} />}>Back To List</Button>
        {!isNew && canEdit && (
          <Button variant="outline" nativeButton={false} render={<Link href={`/clients/new?copy=${id}`} />}>Permohonan baru untuk client ini</Button>
        )}
        {!isNew && canEdit && (
          <span className="ml-auto">
            <ConfirmDelete title={`Hapus client #${id}?`} description="Data client, lampiran, dan conversation-nya akan dihapus permanen."
              onConfirm={async () => { const r = await deleteClient(id!); if (r.ok) router.push("/clients"); return r; }} />
          </span>
        )}
      </div>
    </form>
  );
}
