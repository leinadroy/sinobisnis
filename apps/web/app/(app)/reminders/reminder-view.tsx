"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Bell, CalendarClock, CheckCircle2, RefreshCw, RotateCcw, Send, Settings } from "lucide-react";
import { toast } from "sonner";
import {
  REMINDER_DAY_LABELS, REMINDER_LABELS, REMINDER_TYPES,
  type ReminderItem, type ReminderLogList, type ReminderLogRow, type ReminderOverview, type ReminderRunResult, type ReminderType,
} from "@sml/shared";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataTable } from "@/components/data-table/data-table";
import { RecordCard } from "@/components/data-table/record-card";
import { cn } from "@/lib/utils";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { reloadSchedule, runReminders } from "./actions";

const STATUS_TONE: Record<string, string> = {
  SENT: "bg-green-100 text-green-700",
  SKIPPED: "bg-slate-100 text-slate-600",
  "NOT SENT": "bg-amber-100 text-amber-800",
  FAILED: "bg-red-100 text-red-700",
};
function StatusBadge({ status }: { status: string | null }) {
  return <span className={cn("inline-flex h-5 items-center rounded-4xl px-2 text-xs font-medium whitespace-nowrap", STATUS_TONE[status ?? ""] ?? "bg-muted")}>{status}</span>;
}

const summarize = (rs: ReminderRunResult[]) =>
  rs.length ? rs.map((r) => `${REMINDER_LABELS[r.type]}: ${r.status}${r.note ? ` (${r.note})` : ""}`).join(" • ") : "Tidak ada client yang perlu direminder.";

/** Status kesiapan (SMTP, penerima, jadwal) + tombol kirim. */
export function ReminderStatus({ overview, canRun, canConfigure }: { overview: ReminderOverview; canRun: boolean; canConfigure: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmForce, setConfirmForce] = useState(false);
  const { schedule, smtpConfigured, recipients } = overview;

  const run = (force: boolean) => start(async () => {
    const res = await runReminders(force);
    setConfirmForce(false);
    if (!res.ok) return void toast.error(res.error);
    const bad = res.data!.some((r) => r.status === "FAILED" || r.status === "NOT SENT");
    toast[bad ? "warning" : "success"](summarize(res.data!), { duration: 10_000 });
    router.push("/reminders?tab=log");
  });
  const reload = () => start(async () => {
    const res = await reloadSchedule();
    if (!res.ok) return void toast.error(res.error);
    toast.success(res.data!.nextRun ? `Jadwal aktif, berikutnya ${fmtDateTime(res.data!.nextRun)}.` : res.data!.error ?? "Jadwal reminder nonaktif.");
    router.refresh();
  });

  const check = (good: boolean, label: React.ReactNode) => (
    <li className="flex items-start gap-2">
      {good ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />}
      <span>{label}</span>
    </li>
  );

  return (
    <Card>
      <CardContent className="flex flex-wrap items-start justify-between gap-4">
        <ul className="space-y-1 text-sm">
          {check(smtpConfigured, smtpConfigured ? "SMTP sudah diatur." : "SMTP belum diatur — email tidak akan terkirim (tercatat NOT SENT).")}
          {check(recipients.general + recipients.accounting > 0,
            <>Penerima aktif: {recipients.general} umum, {recipients.accounting} accounting{recipients.general + recipients.accounting === 0 && " — tambahkan di Email Recipient"}.</>)}
          {check(schedule.enabled && !schedule.error && !!schedule.nextRun, (
            <span className="inline-flex flex-wrap items-center gap-1">
              <CalendarClock className="size-3.5" />
              {schedule.error ? schedule.error
                : schedule.enabled ? <>Otomatis <code className="rounded bg-muted px-1">{schedule.cron}</code> ({schedule.timezone}), berikutnya <b>{fmtDateTime(schedule.nextRun)}</b>.</>
                : "Reminder otomatis nonaktif (Reminder Enabled = 0 di System Configurator)."}
            </span>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          {canRun && (
            <>
              <Button onClick={() => run(false)} disabled={pending}><Send /> {pending ? "Mengirim…" : "Kirim reminder sekarang"}</Button>
              <Button variant="outline" onClick={() => setConfirmForce(true)} disabled={pending} title="Kirim ulang walaupun sudah terkirim hari ini"><RotateCcw /> Kirim ulang (paksa)</Button>
              <Button variant="outline" onClick={reload} disabled={pending}><RefreshCw /> Muat ulang jadwal</Button>
            </>
          )}
          {canConfigure && <Button variant="ghost" nativeButton={false} render={<Link href="/developer/system-config" />}><Settings /> Pengaturan</Button>}
        </div>
      </CardContent>
      <AlertDialog open={confirmForce} onOpenChange={setConfirmForce}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kirim ulang semua reminder?</AlertDialogTitle>
            <AlertDialogDescription>Semua kategori & Keperluan yang punya client hari ini akan dikirim lagi walaupun sudah terkirim. Penerima bisa mendapat email ganda.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(true)} disabled={pending}>Kirim ulang</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export function ReminderTabs({ overview, tab }: { overview: ReminderOverview; tab: string }) {
  const cls = (on: boolean) => cn(
    "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
    on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground",
  );
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" aria-label="Kategori reminder">
      {REMINDER_TYPES.map((t) => (
        <Link key={t} href={`/reminders?tab=${t}`} className={cls(tab === t)} aria-current={tab === t ? "page" : undefined}>
          {REMINDER_LABELS[t]}
          <span className={cn("rounded-full px-1.5 text-xs tabular-nums", tab === t ? "bg-primary-foreground/20" : overview.counts[t] ? "bg-amber-200 text-amber-900" : "bg-background")}>{overview.counts[t]}</span>
        </Link>
      ))}
      <Link href="/reminders?tab=log" className={cls(tab === "log")} aria-current={tab === "log" ? "page" : undefined}><Bell className="size-3.5" /> Notification Log</Link>
    </nav>
  );
}

/** Warna baris kategori expired, sama dengan list client. */
function rowTone(type: ReminderType, r: ReminderItem) {
  if (!type.startsWith("EXPIRED") || r.days === null) return undefined;
  return r.days <= 30 ? "bg-orange-50" : "bg-yellow-50";
}

export function ReminderItemsTable({ type, items }: { type: ReminderType; items: ReminderItem[] }) {
  const dayLabel = REMINDER_DAY_LABELS[type];
  const days = (r: ReminderItem) => (r.days === null ? "" : String(r.days));
  if (!items.length) return <p className="rounded-lg border py-10 text-center text-sm text-muted-foreground">Tidak ada client untuk kategori ini.</p>;
  return (
    <>
      <div className="space-y-2 md:hidden">
        {items.map((r) => (
          <RecordCard key={r.id}
            title={<Link href={`/clients/${r.id}`} className="text-primary hover:underline">{r.name}</Link>}
            fields={[
              ["Keperluan", r.keperluanName], ["Sponsor", r.sponsorName], ["Expired", fmtDate(r.expiredDokumen)],
              ["Proses Selesai", fmtDate(r.tanggalProsesSelesai)], ["No Invoice", r.noInvoice], ["Tgl Invoice", fmtDate(r.tanggalInvoice)],
              ...(dayLabel ? [[dayLabel, days(r)] as [string, string]] : []),
            ]}
          />
        ))}
      </div>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>No</TableHead><TableHead>Nama</TableHead><TableHead>Sponsor</TableHead><TableHead>Project</TableHead><TableHead>No Paspor</TableHead>
              <TableHead>Keperluan</TableHead><TableHead>Proses Selesai</TableHead><TableHead>Expired</TableHead><TableHead>No Invoice</TableHead><TableHead>Tgl Invoice</TableHead>
              {dayLabel && <TableHead className="text-right">{dayLabel}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((r) => (
              <TableRow key={r.id} className={rowTone(type, r)}>
                <TableCell className="tabular-nums">{r.id}</TableCell>
                <TableCell><Link href={`/clients/${r.id}`} className="font-medium text-primary hover:underline">{r.name}</Link></TableCell>
                <TableCell>{r.sponsorName}</TableCell>
                <TableCell>{r.projectName}</TableCell>
                <TableCell>{r.noPaspor}</TableCell>
                <TableCell>{r.keperluanName}</TableCell>
                <TableCell className="whitespace-nowrap">{fmtDate(r.tanggalProsesSelesai)}</TableCell>
                <TableCell className="whitespace-nowrap">{fmtDate(r.expiredDokumen)}</TableCell>
                <TableCell>{r.noInvoice}</TableCell>
                <TableCell className="whitespace-nowrap">{fmtDate(r.tanggalInvoice)}</TableCell>
                {dayLabel && <TableCell className="text-right tabular-nums">{days(r)}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">{items.length} client · {new Set(items.map((r) => r.keperluanId)).size} Keperluan (satu email per Keperluan)</p>
    </>
  );
}

const logColumns: ColumnDef<ReminderLogRow, unknown>[] = ([
  { id: "createdAt", header: "Waktu", cell: ({ row }) => <span className="whitespace-nowrap">{fmtDateTime(row.original.createdAt)}</span> },
  { id: "type", header: "Kategori", cell: ({ row }) => <span className="whitespace-nowrap">{REMINDER_LABELS[row.original.type as ReminderType] ?? row.original.type}</span> },
  { id: "keperluan", header: "Keperluan", cell: ({ row }) => <span className="line-clamp-2 min-w-48 whitespace-normal" title={row.original.text}>{row.original.keperluan ?? row.original.text}</span> },
  { id: "itemCount", header: "Jumlah", cell: ({ row }) => <span className="tabular-nums">{row.original.itemCount}</span> },
  { id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  { id: "runBy", header: "Oleh", cell: ({ row }) => row.original.runBy },
  { id: "error", header: "Error", cell: ({ row }) => <span className="line-clamp-2 min-w-48 whitespace-normal text-xs text-destructive">{row.original.error}</span> },
] satisfies ColumnDef<ReminderLogRow, unknown>[]).map((c) => ({ ...c, enableSorting: false, meta: { label: c.header } }));

export function ReminderLogTable({ list }: { list: ReminderLogList }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const items = [{ value: "", label: "Semua status" }, ...["SENT", "NOT SENT", "FAILED"].map((s) => ({ value: s, label: s }))];
  return (
    <DataTable
      columns={logColumns}
      data={list.data}
      total={list.total}
      page={list.page}
      pageSize={list.pageSize}
      searchPlaceholder="Cari Keperluan, user, error…"
      toolbar={
        <>
        <Select items={items} value={params.get("status") ?? ""} onValueChange={(v) => {
          const next = new URLSearchParams(params.toString());
          if (v) next.set("status", v); else next.delete("status");
          next.set("page", "1");
          start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
        }}>
          <SelectTrigger className="w-40" aria-label="Status" disabled={pending}><SelectValue /></SelectTrigger>
          <SelectContent>{items.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" className="size-4 accent-primary" checked={params.get("empty") === "1"} disabled={pending} onChange={(e) => {
            const next = new URLSearchParams(params.toString());
            if (e.target.checked) next.set("empty", "1"); else next.delete("empty");
            next.set("page", "1");
            start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
          }} />
          Tampilkan log 0 items
        </label>
        </>
      }
      renderCard={(r) => (
        <RecordCard
          title={<span>{REMINDER_LABELS[r.type as ReminderType] ?? r.type}</span>}
          fields={[["Status", <StatusBadge key="s" status={r.status} />], ["Waktu", fmtDateTime(r.createdAt)], ["Keperluan", r.keperluan], ["Jumlah", String(r.itemCount ?? "")], ["Oleh", r.runBy], ["Error", r.error]]}
        />
      )}
    />
  );
}
