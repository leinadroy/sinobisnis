"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MailCheck, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import type { SystemConfigRow } from "@sml/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDelete } from "@/components/confirm-delete";
import { createConfig, deleteConfig, sendTestEmail, setConfig } from "./actions";

/** Satu key: simpan per baris supaya perubahan kecil tidak menimpa key lain. */
function ConfigRow({ row, canEdit }: { row: SystemConfigRow; canEdit: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(row.value ?? "");
  const [pending, start] = useTransition();
  const dirty = row.secret ? value !== "" : value !== (row.value ?? "");
  const long = !row.secret && (value.length > 60 || value.includes("\n"));
  const builtIn = row.label !== null;

  const save = () => start(async () => {
    const res = await setConfig(row.key, value);
    if (!res.ok) return void toast.error(res.error);
    toast.success(`${row.key} disimpan.`);
    if (row.secret) setValue("");
    router.refresh();
  });

  return (
    <div className="grid gap-2 border-b py-3 last:border-0 md:grid-cols-[18rem_minmax(0,1fr)_auto] md:items-start">
      <div>
        <code className="text-sm font-semibold">{row.key}</code>
        {row.label && <p className="text-xs text-muted-foreground">{row.label}</p>}
      </div>
      <div className="space-y-1">
        {long ? (
          <Textarea rows={3} value={value} onChange={(e) => setValue(e.target.value)} disabled={!canEdit || pending} aria-label={row.key} />
        ) : (
          <Input
            type={row.secret ? "password" : "text"}
            autoComplete={row.secret ? "new-password" : "off"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && dirty) save(); }}
            placeholder={row.secret ? (row.hasValue ? "•••••• tersimpan — ketik untuk mengganti" : "belum diisi") : ""}
            disabled={!canEdit || pending}
            aria-label={row.key}
          />
        )}
        {row.help && <p className="text-xs text-muted-foreground">{row.help}</p>}
      </div>
      {canEdit && (
        <div className="flex items-center gap-1">
          <Button size="sm" variant={dirty ? "default" : "outline"} disabled={!dirty || pending} onClick={save}><Save /> Simpan</Button>
          {row.secret && row.hasValue && (
            <Button size="sm" variant="ghost" disabled={pending} title="Kosongkan nilai"
              onClick={() => start(async () => { const r = await setConfig(row.key, ""); if (r.ok) { toast.success(`${row.key} dikosongkan.`); router.refresh(); } else toast.error(r.error); })}>
              Kosongkan
            </Button>
          )}
          {!builtIn && <ConfirmDelete title={`Hapus key ${row.key}?`} onConfirm={() => deleteConfig(row.key)} />}
        </div>
      )}
    </div>
  );
}

export function SystemConfigEditor({ rows, canEdit }: { rows: SystemConfigRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [testTo, setTestTo] = useState("");

  const add = () => start(async () => {
    const res = await createConfig(key, value);
    if (!res.ok) return void toast.error(res.error);
    toast.success(`${res.data!.key} ditambahkan.`);
    setKey(""); setValue("");
    router.refresh();
  });
  const test = () => start(async () => {
    const res = await sendTestEmail(testTo);
    if (!res.ok) return void toast.error(res.error, { duration: 10_000 });
    toast.success(`Email uji dikirim ke ${testTo}. Periksa kotak masuk (dan folder spam).`);
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Card>
        <CardContent>
          {rows.map((r) => <ConfigRow key={`${r.key}:${r.value}:${r.hasValue}`} row={r} canEdit={canEdit} />)}
        </CardContent>
      </Card>
      {canEdit && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><MailCheck className="size-4" /> Tes SMTP</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">Simpan pengaturan SMTP dulu, lalu kirim email uji.</p>
              <Input type="email" placeholder="email@domain.com" value={testTo} onChange={(e) => setTestTo(e.target.value)} aria-label="Email tujuan uji" />
              <Button variant="outline" disabled={pending || !testTo.includes("@")} onClick={test}>{pending ? "Mengirim…" : "Kirim email uji"}</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="size-4" /> Key baru</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Input placeholder="Nama key, mis. Web Folder Name" maxLength={100} value={key} onChange={(e) => setKey(e.target.value)} aria-label="Key baru" />
              <Input placeholder="Nilai" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Nilai key baru" />
              <Button variant="outline" disabled={pending || !key.trim()} onClick={add}>Tambah</Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
