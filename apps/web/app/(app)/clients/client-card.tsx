"use client";

import Link from "next/link";
import { MessageSquareText, Paperclip } from "lucide-react";
import { daysUntil, type ClientRow } from "@sml/shared";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";

/** Warna garis tepi & latar kartu sesuai sisa hari expired (sama dengan warna baris tabel). */
function expiryTone(r: ClientRow) {
  const d = r.prosesPerpanjangan ? null : daysUntil(r.expiredDokumen);
  if (d === null) return { card: "border-l-border", badge: "", days: d };
  if (d < 0) return { card: "border-l-red-500 bg-red-50/60", badge: "bg-red-100 text-red-700", days: d };
  if (d <= 30) return { card: "border-l-orange-500 bg-orange-50/60", badge: "bg-orange-100 text-orange-700", days: d };
  if (d <= 60) return { card: "border-l-yellow-500 bg-yellow-50/60", badge: "bg-yellow-100 text-yellow-800", days: d };
  return { card: "border-l-border", badge: "bg-muted text-muted-foreground", days: d };
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  );
}

/** Kartu satu client untuk tampilan HP (pengganti baris tabel yang harus di-scroll ke samping). */
export function ClientCard({ row: r, archived }: { row: ClientRow; archived?: boolean }) {
  const tone = expiryTone(r);
  return (
    <article className={cn("rounded-lg border border-l-4 bg-card p-3 text-sm shadow-xs", tone.card)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/clients/${r.id}`} className="block truncate text-base font-semibold text-primary hover:underline">{r.name}</Link>
          <p className="truncate text-xs text-muted-foreground">
            #{r.id}{r.sponsorName && ` · ${r.sponsorName}`}{r.projectName && ` · ${r.projectName}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-muted-foreground">
          {r.attachmentCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-xs" title={`${r.attachmentCount} lampiran`}><Paperclip className="size-3.5" />{r.attachmentCount}</span>
          )}
          <Link href={`/clients/${r.id}#conversation`} aria-label="Conversation" className="rounded-md p-1.5 hover:bg-muted"><MessageSquareText className="size-4" /></Link>
        </div>
      </div>

      {archived && r.archivedReason && <p className="mt-2 rounded bg-muted px-2 py-1 text-xs">Arsip: {r.archivedReason}</p>}

      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
        <Item label="Keperluan">{r.keperluanName}</Item>
        <Item label="No Paspor">{r.noPaspor}</Item>
        <Item label="Permohonan">{fmtDate(r.tanggalPermohonan)}</Item>
        <Item label="Proses Selesai / Status">{r.tanggalProsesSelesai ? fmtDate(r.tanggalProsesSelesai) : r.status}</Item>
        <Item label="Expired Dokumen">
          {r.expiredDokumen && (
            <span className="inline-flex flex-wrap items-center gap-1">
              {fmtDate(r.expiredDokumen)}
              {tone.days !== null && (
                <span className={cn("rounded px-1 text-[11px] font-medium", tone.badge)}>{tone.days < 0 ? `lewat ${-tone.days} hr` : `${tone.days} hr`}</span>
              )}
            </span>
          )}
        </Item>
        <Item label="No Invoice">{r.noInvoice}</Item>
        <Item label="No RPTKA">{r.noRptka}</Item>
        <Item label="Pembayaran Invoice">{fmtDate(r.tanggalPembayaranInvoice)}</Item>
      </dl>
    </article>
  );
}
