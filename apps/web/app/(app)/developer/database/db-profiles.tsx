"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Database, PlugZap, Repeat, XCircle } from "lucide-react";
import { toast } from "sonner";
import { DB_TONE_LABEL, type DbProfileRow, type DbProfilesResponse, type DbTestResult } from "@sml/shared";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/format";
import { switchProfile, testProfile } from "./actions";

const TONE: Record<DbProfileRow["tone"], string> = {
  local: "bg-green-100 text-green-800",
  staging: "bg-amber-100 text-amber-900",
  production: "bg-red-600 text-white",
};

function TestResult({ r }: { r: DbTestResult }) {
  return (
    <div className={cn("rounded-md border p-3 text-sm", r.ok ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50")}>
      <div className="flex items-center gap-2 font-medium">
        {r.ok ? <CheckCircle2 className="size-4 text-green-700" /> : <XCircle className="size-4 text-red-700" />}
        {r.ok ? "Koneksi berhasil, struktur cocok" : "Tidak bisa dipakai"} <span className="font-normal text-muted-foreground">({r.ms} ms)</span>
      </div>
      {r.error && <p className="mt-1 text-red-800">{r.error}</p>}
      {r.version && (
        <p className="mt-1 text-muted-foreground">
          {r.version} · database <b>{r.database}</b> · tabel aplikasi {r.tablesFound}/{r.tablesExpected}
          {r.users !== null && <> · {r.users} user · {r.invoices} invoice</>}
          {r.readOnlySession && <> · sesi <b>READ ONLY</b></>}
        </p>
      )}
      {r.missingTables.length > 0 && <p className="mt-1 text-xs text-red-800">Tidak ada: {r.missingTables.join(", ")}</p>}
    </div>
  );
}

export function DbProfiles({ data }: { data: DbProfilesResponse }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tests, setTests] = useState<Record<string, DbTestResult>>({});
  const [target, setTarget] = useState<DbProfileRow | null>(null);
  const [confirm, setConfirm] = useState("");

  const test = (p: DbProfileRow) => start(async () => {
    const res = await testProfile(p.key);
    if (!res.ok) return void toast.error(res.error);
    setTests((t) => ({ ...t, [p.key]: res.data! }));
  });

  const doSwitch = () => start(async () => {
    if (!target) return;
    const res = await switchProfile(target.key, confirm.trim());
    if (!res.ok) return void toast.error(res.error, { duration: 10_000 });
    toast.success(`Database dipindah ke ${target.label}. Silakan login ulang.`);
    router.replace("/login?db=switched");
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {data.profiles.map((p) => (
          <Card key={p.key} className={cn(p.active && "ring-2 ring-primary")}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <Database className="size-4" /> {p.label}
                <span className={cn("rounded px-1.5 py-0.5 text-xs font-semibold uppercase", TONE[p.tone])}>{DB_TONE_LABEL[p.tone]}</span>
                {p.readOnly && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-900">HANYA BACA</span>}
                {p.active && <span className="rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">AKTIF</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {p.configured ? (
                <dl className="grid grid-cols-[7rem_1fr] gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Profil</dt><dd><code>{p.key}</code></dd>
                  <dt className="text-muted-foreground">Server</dt><dd>{p.host}:{p.port}</dd>
                  <dt className="text-muted-foreground">Database</dt><dd>{p.database}</dd>
                  <dt className="text-muted-foreground">User</dt><dd>{p.user}</dd>
                  <dt className="text-muted-foreground">Sinkron menu</dt><dd>{p.menuSync ? "ya (menu baru 38–42 ditambahkan otomatis)" : "tidak"}</dd>
                  {p.readOnly && <><dt className="text-muted-foreground">Login & akses</dt><dd>dari profil <b>{p.authLabel ?? "-"}</b> (password di database ini tidak bisa diatur)</dd></>}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">Belum dikonfigurasi. Isi <code>DB_URL_{p.key.toUpperCase().replace(/[^A-Z0-9]/g, "_")}</code> di <code>apps/api/.env</code> lalu restart API.</p>
              )}
              {tests[p.key] && <TestResult r={tests[p.key]} />}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={pending || !p.configured} onClick={() => test(p)}><PlugZap /> Tes koneksi</Button>
                {!p.active && (
                  <Button size="sm" variant={p.danger ? "destructive" : "default"} disabled={pending || !p.configured} onClick={() => { setConfirm(""); setTarget(p); }}>
                    <Repeat /> Pakai database ini
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {data.lastChange
          ? <>Terakhir dipindah {fmtDateTime(data.lastChange.at)} oleh {data.lastChange.by} ({data.lastChange.from ?? "-"} → {data.lastChange.to}). </>
          : "Belum pernah dipindah dari halaman ini. "}
        Pilihan disimpan di <code>{data.stateFile}</code>.
      </p>

      <AlertDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {target?.danger && <AlertTriangle className="size-5 text-red-600" />} Pindah ke database {target?.label}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Aplikasi akan memakai {target?.host}/{target?.database}. Koneksi dan struktur dicek dulu; bila gagal, database tidak berubah.
              Semua user (termasuk Anda) harus login ulang, dan jadwal reminder dibaca ulang dari database baru.
              {target?.readOnly && <> Database ini <b>hanya dibaca</b>: semua simpan/hapus ditolak, reminder tidak dijalankan, dan login memakai akun dari profil {target.authLabel}.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {target?.danger && (
            <div className="space-y-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
              <p>Ini database <b>PRODUCTION</b>: semua perubahan langsung mengenai data asli. Pastikan aplikasi lama sudah tidak dipakai, sudah ada backup, dan <b>Reminder Enabled</b> sesuai keputusan.</p>
              <p>Ketik <code className="font-bold">{target.key.toUpperCase()}</code> untuk melanjutkan:</p>
              <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Konfirmasi nama profil" autoFocus />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
            <AlertDialogAction disabled={pending || (!!target?.danger && confirm.trim() !== target.key.toUpperCase())}
              className={cn(target?.danger && "bg-red-600 hover:bg-red-700")} onClick={(e) => { e.preventDefault(); doSwitch(); }}>
              {pending ? "Memindah…" : "Pindah"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
