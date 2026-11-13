import type { Metadata } from "next";
import { REMINDER_DAY_LABELS, REMINDER_LABELS, REMINDER_TYPES, type ReminderItem, type ReminderPrintData, type ReminderType } from "@sml/shared";
import { Forbidden } from "@/components/page-header";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { getAccess } from "@/lib/session";
import { ReminderPrintToolbar } from "./print-toolbar";
import "./print.css";

export const metadata: Metadata = { title: "Cetak Daftar Reminder" };

const isType = (v: unknown): v is ReminderType => typeof v === "string" && (REMINDER_TYPES as readonly string[]).includes(v);
const INVOICE_TYPES: ReminderType[] = ["INVOICE_CREATE", "INVOICE_PAY"];

/** Client per Keperluan (urutan nama Keperluan, lalu nama client — sama dengan halaman Email Reminder). */
function byKeperluan(items: ReminderItem[]) {
  const groups = new Map<number, { id: number; name: string; items: ReminderItem[] }>();
  for (const r of items) {
    const g = groups.get(r.keperluanId) ?? { id: r.keperluanId, name: r.keperluanName ?? "(tanpa Keperluan)", items: [] };
    g.items.push(r);
    groups.set(r.keperluanId, g);
  }
  return [...groups.values()];
}

function Category({ type, items }: { type: ReminderType; items: ReminderItem[] }) {
  const invoice = INVOICE_TYPES.includes(type);
  const dayLabel = REMINDER_DAY_LABELS[type];
  const groups = byKeperluan(items);
  return (
    <section className="cat">
      <h2>
        {REMINDER_LABELS[type]}
        <span className="count">{items.length} client · {groups.length} Keperluan</span>
      </h2>
      {!items.length ? (
        <p className="empty">Tidak ada client untuk kategori ini.</p>
      ) : (
        <table className="list">
          <thead>
            <tr>
              <th className="n">#</th><th>Nama</th><th>No Paspor</th><th>Sponsor</th><th>Project</th><th>Keperluan</th>
              {invoice ? <><th>Proses Selesai</th><th>No Invoice</th><th>Tgl Invoice</th></> : <th>Expired Dokumen</th>}
              {dayLabel && <th className="r">{dayLabel}</th>}
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.id}>
              <tr className="kep"><td colSpan={invoice ? 10 : 8}>{g.name} <span>({g.items.length})</span></td></tr>
              {g.items.map((r, i) => (
                <tr key={r.id}>
                  <td className="n">{i + 1}</td>
                  <td>{r.name}</td>
                  <td>{r.noPaspor}</td>
                  <td>{r.sponsorName}</td>
                  <td>{r.projectName}</td>
                  <td>{r.keperluanName}</td>
                  {invoice ? (
                    <><td className="d">{fmtDate(r.tanggalProsesSelesai)}</td><td>{r.noInvoice}</td><td className="d">{fmtDate(r.tanggalInvoice)}</td></>
                  ) : (
                    <td className="d">{fmtDate(r.expiredDokumen)}</td>
                  )}
                  {dayLabel && <td className="r">{r.days ?? ""}</td>}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      )}
    </section>
  );
}

/**
 * Cetakan daftar Email Reminder hari ini, A4 landscape: semua kategori (satu bagian per kategori, dikelompokkan per
 * Keperluan) atau satu kategori saja dengan `?type=`. Halaman yang sama dirender headless oleh /bff/reminders/pdf.
 */
export default async function PrintRemindersPage({ searchParams }: PageProps<"/print/reminders">) {
  const { view } = await getAccess("reminders");
  if (!view) return <div className="p-6"><Forbidden /></div>;
  const sp = await searchParams;
  const only = isType(sp.type) ? sp.type : null;
  const data = await apiFetch<ReminderPrintData>("/reminders/items/all");
  const types = only ? [only] : [...REMINDER_TYPES];
  const total = types.reduce((n, t) => n + data.items[t].length, 0);

  return (
    <div className="reminder-print">
      <ReminderPrintToolbar type={only} />
      <div className="page">
        <header>
          <h1>Daftar Email Reminder{only ? ` — ${REMINDER_LABELS[only]}` : ""}</h1>
          <p>Tanggal {fmtDate(data.date)} · {total} client{only ? "" : ` · ${types.length} kategori`}</p>
          {!only && (
            <ul className="summary">
              {types.map((t) => <li key={t}>{REMINDER_LABELS[t]}: <b>{data.items[t].length}</b></li>)}
            </ul>
          )}
        </header>
        {types.map((t) => <Category key={t} type={t} items={data.items[t]} />)}
      </div>
    </div>
  );
}
