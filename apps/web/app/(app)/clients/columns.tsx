"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { MessageSquareText, Paperclip, Pencil } from "lucide-react";
import { daysUntil, type ClientRow } from "@sml/shared";
import { Button } from "@/components/ui/button";
import { SortHeader } from "@/components/data-table/column-header";
import { fmtDate } from "@/lib/format";

type Col = { id: keyof ClientRow; label: string; date?: boolean; sortable?: boolean; wrap?: boolean };

// Urutan & judul kolom mengikuti list Client di production.
const COLS: Col[] = [
  { id: "id", label: "No", sortable: true },
  { id: "sponsorName", label: "Sponsor", sortable: true },
  { id: "projectName", label: "Project", sortable: true },
  { id: "tanggalPermohonan", label: "Tanggal Permohonan", date: true, sortable: true },
  { id: "permohonanHariKe3", label: "Permohonan Hari Ke3" },
  { id: "name", label: "Nama Client", sortable: true },
  { id: "noPaspor", label: "No Paspor", sortable: true },
  { id: "tanggalLahir", label: "Lahir", date: true, sortable: true },
  { id: "noRptka", label: "No RPTKA", sortable: true },
  { id: "keperluanName", label: "Keperluan", sortable: true },
  { id: "tanggalProsesSelesai", label: "Proses Selesai / Status", date: true, sortable: true },
  { id: "expiredDokumen", label: "Expired Dokumen", date: true, sortable: true },
  { id: "epo", label: "EPO" },
  { id: "noInvoice", label: "No Invoice", sortable: true },
  { id: "tanggalInvoice", label: "Tanggal Invoice", date: true, sortable: true },
  { id: "tanggalPembayaranInvoice", label: "Pembayaran Invoice", date: true, sortable: true },
  { id: "keteranganTka", label: "Keterangan TKA", wrap: true },
  { id: "tanggalTerbitDokumen", label: "Terbit Dokumen", date: true, sortable: true },
  { id: "tanggalMasukLastExp", label: "Masuk Indo / Last Exp", date: true, sortable: true },
  { id: "status", label: "Status", sortable: true },
  { id: "sktt", label: "SKTT" },
  { id: "stm", label: "STM" },
];

/** Kolom yang awalnya disembunyikan (bisa ditampilkan lewat menu Kolom). */
export const CLIENT_HIDDEN_COLUMNS = ["permohonanHariKe3", "tanggalLahir", "epo", "keteranganTka", "tanggalTerbitDokumen", "tanggalMasukLastExp", "sktt", "stm", "status"];

/** Warna baris berdasarkan sisa hari Expired Dokumen (tidak berlaku bila sedang proses perpanjangan). */
export function expiryClass(r: ClientRow) {
  const d = r.prosesPerpanjangan ? null : daysUntil(r.expiredDokumen);
  if (d === null) return undefined;
  if (d < 0) return "bg-red-50 hover:bg-red-100/70";
  if (d <= 30) return "bg-orange-50 hover:bg-orange-100/70";
  if (d <= 60) return "bg-yellow-50 hover:bg-yellow-100/70";
  return undefined;
}

export function clientColumns(archived: boolean): ColumnDef<ClientRow, unknown>[] {
  const cols: ColumnDef<ClientRow, unknown>[] = COLS.map((c) => ({
    id: c.id,
    accessorKey: c.id,
    meta: { label: c.label },
    enableSorting: !!c.sortable,
    enableHiding: c.id !== "name",
    header: c.sortable ? ({ column }) => <SortHeader column={column} title={c.label} /> : c.label,
    cell: ({ row }) => {
      const r = row.original;
      const v = r[c.id];
      if (c.id === "name") return <Link href={`/clients/${r.id}`} className="font-medium text-primary hover:underline">{r.name}</Link>;
      if (c.id === "tanggalProsesSelesai") return r.tanggalProsesSelesai ? fmtDate(r.tanggalProsesSelesai) : <span className="text-muted-foreground">{r.status ?? ""}</span>;
      if (c.id === "expiredDokumen" && v) {
        const d = daysUntil(r.expiredDokumen);
        return <span className="whitespace-nowrap">{fmtDate(r.expiredDokumen)} {d !== null && <span className="text-xs text-muted-foreground">({d < 0 ? `lewat ${-d}` : d} hr)</span>}</span>;
      }
      if (c.date) return <span className="whitespace-nowrap">{fmtDate(v as string | null)}</span>;
      return <span className={c.wrap ? "line-clamp-2 min-w-48 whitespace-normal" : "whitespace-nowrap"}>{v === null || v === undefined ? "" : String(v)}</span>;
    },
  }));
  if (archived) {
    cols.unshift({ id: "archivedReason", accessorKey: "archivedReason", header: "Alasan Archive", meta: { label: "Alasan Archive" }, enableSorting: false });
  }
  cols.unshift({
    id: "actions", header: "", enableHiding: false, enableSorting: false,
    cell: ({ row }) => (
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon-xs" aria-label="Buka" nativeButton={false} render={<Link href={`/clients/${row.original.id}`} />}><Pencil /></Button>
        <Button variant="ghost" size="icon-xs" aria-label="Conversation" nativeButton={false} render={<Link href={`/clients/${row.original.id}#conversation`} />}><MessageSquareText /></Button>
        {row.original.attachmentCount > 0 && (
          <span className="inline-flex items-center text-xs text-muted-foreground" title={`${row.original.attachmentCount} lampiran`}>
            <Paperclip className="size-3" />{row.original.attachmentCount}
          </span>
        )}
      </div>
    ),
  });
  return cols;
}
