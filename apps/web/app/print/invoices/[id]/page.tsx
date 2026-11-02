import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { terbilangEn, type InvoicePrintData } from "@sml/shared";
import { Forbidden } from "@/components/page-header";
import { apiFetch, ApiError } from "@/lib/api";
import { getAccess } from "@/lib/session";
import { PrintToolbar } from "./print-toolbar";
import "./print.css";

export async function generateMetadata({ params }: PageProps<"/print/invoices/[id]">): Promise<Metadata> {
  return { title: `Cetak Invoice #${(await params).id}` };
}

/** Format angka cetakan seperti production: 1,392,812,100 */
const n = (v: number) => Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
/** 'YYYY-MM-DD' → 'DD/MM/YYYY' */
const dmy = (s: string | null) => (s ? s.slice(0, 10).split("-").reverse().join("/") : "");

/** Cetakan invoice A4 (dibuka di tab baru; Print / Simpan PDF memakai dialog cetak browser). */
export default async function PrintInvoicePage({ params }: PageProps<"/print/invoices/[id]">) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const { view } = await getAccess("invoices");
  if (!view) return <div className="p-6"><Forbidden /></div>;
  const { invoice: inv, company, billTo, bank } = await apiFetch<InvoicePrintData>(`/invoices/${id}/print`)
    .catch((e) => { if (e instanceof ApiError && e.status === 404) notFound(); throw e; });

  // Baris tabel: item layanan grup lalu nama client bernomor; nomor grup hanya di baris pertama.
  const rows = inv.groups.flatMap((g, gi) => [
    ...g.items.map((it) => ({ kind: "svc" as const, it })),
    ...g.clients.map((c, ci) => ({ kind: "name" as const, text: `${ci + 1}. ${c.name}` })),
  ].map((r, ri) => ({ ...r, no: ri === 0 ? gi + 1 : null, key: `${gi}-${ri}` })));

  return (
    <div className="invoice-print">
      <PrintToolbar />
      {inv.status === "DRAFT" && <p className="draft-note print:hidden">DRAFT — belum final</p>}
      <div className="page">
        {/* eslint-disable-next-line @next/next/no-img-element -- svg statis, perlu ukuran asli saat dicetak */}
        <img className="logo" src="/logo.svg" alt={company?.name ?? "Sinobisnis"} />
        <div className="banner">INVOICE</div>

        <table className="meta">
          <tbody>
            <tr><td className="k">Invoice Date</td><td className="c">:</td><td>{dmy(inv.date)}</td></tr>
            <tr><td className="k">Invoice No</td><td className="c">:</td><td>{inv.no}</td></tr>
            <tr><td className="k">To</td><td className="c">:</td><td>{billTo?.companyName}</td></tr>
            {billTo?.address.map((a, i) => <tr key={i}><td /><td /><td>{a}</td></tr>)}
            <tr><td className="k">NPWP</td><td className="c">:</td><td>{inv.npwp || billTo?.npwp}</td></tr>
          </tbody>
        </table>

        <table className="items">
          <thead><tr><th>No</th><th>Description</th><th>Pax</th><th>Price Per Pax</th><th>Total Price</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className={`${r.kind}${i === rows.length - 1 ? " last" : ""}`}>
                <td className="no">{r.no ?? ""}</td>
                {r.kind === "svc" ? (
                  <>
                    <td>{r.it.description}</td>
                    <td className="pax">{n(r.it.qty)}</td>
                    <td className="r">{n(r.it.unitPrice)}</td>
                    <td className="r">{n(r.it.subTotal)}</td>
                  </>
                ) : (
                  <><td>{r.text}</td><td className="pax" /><td className="r" /><td className="r" /></>
                )}
              </tr>
            ))}
            {!rows.length && <tr className="last"><td className="no" /><td>&nbsp;</td><td className="pax" /><td className="r" /><td className="r" /></tr>}
          </tbody>
        </table>
        <table className="sum">
          <tbody>
            <tr><td className="pad" /><td className="lbl">Sub Total</td><td className="val">{n(inv.subTotal)}</td></tr>
            {inv.taxes.map((t, i) => <tr key={i}><td className="pad" /><td className="lbl">{t.description}</td><td className="val">{n(t.value)}</td></tr>)}
            <tr><td className="pad end" /><td className="lbl">Total Invoice</td><td className="val">{n(inv.total)}</td></tr>
          </tbody>
        </table>

        <div className="boxes">
          <div className="box-wrap"><div className="t">Important Information</div><div className="box info">{inv.information}</div></div>
          <div className="box-wrap">
            <div className="t">In Words</div>
            <div className="box words">#Indonesia Rupiah {inv.total < 0 ? "Minus " : ""}{terbilangEn(inv.total)}#</div>
          </div>
        </div>

        {bank && (
          <div className="pay">
            <div className="t">Please Transfer The Payment To :</div>
            <div className="box">
              <table>
                <tbody>
                  <tr><td className="k">Bank</td><td>:</td><td>{bank.bankName}</td></tr>
                  {bank.branch && <tr><td className="k">Branch</td><td>:</td><td>{bank.branch}</td></tr>}
                  {bank.address && <tr><td className="k">Bank Address</td><td>:</td><td className="pre">{bank.address}</td></tr>}
                  {bank.swiftcode && <tr><td className="k">Swiftcode</td><td>:</td><td>{bank.swiftcode}</td></tr>}
                  <tr><td className="k">Account For</td><td>:</td><td>{bank.accountFor}</td></tr>
                  <tr><td className="k">Acc. No</td><td>:</td><td>{bank.accountNo}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="sign"><div><div className="nm">{company?.signedBy}</div><div className="tt">{company?.signedTitle || "Finance"}</div></div></div>
        {company?.address && <div className="foot">{company.address}</div>}
      </div>
    </div>
  );
}
