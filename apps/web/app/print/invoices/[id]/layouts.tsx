/* eslint-disable @next/next/no-img-element -- gambar statis cetakan, perlu ukuran asli saat dicetak / dibuat PDF */
import { terbilangEn, type InvoicePrintData } from "@sml/shared";

// Tiga model cetakan sesuai awalan nomor invoice, dimodelkan dari SML-/RTS-/JCSS-Invoice.pdf
// (sama dengan apps/invoice-printer: layout.py, layout_rts.py, layout_jcss.py).

/** Format angka cetakan seperti production: 1,392,812,100 */
const n = (v: number) => Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
/** 'YYYY-MM-DD' → 'DD/MM/YYYY' */
const dmy = (s: string | null) => (s ? s.slice(0, 10).split("-").reverse().join("/") : "");
const words = (total: number) => `#Indonesia Rupiah ${total < 0 ? "Minus " : ""}${terbilangEn(total)}#`;

type Row =
  | { kind: "svc"; key: string; no: number | null; groupStart: boolean; it: InvoicePrintData["invoice"]["groups"][number]["items"][number] }
  | { kind: "name"; key: string; no: number | null; groupStart: boolean; text: string };

/** Baris tabel: item layanan grup lalu nama client bernomor; nomor grup hanya di baris pertama. */
function itemRows(inv: InvoicePrintData["invoice"]): Row[] {
  return inv.groups.flatMap((g, gi) =>
    [
      ...g.items.map((it) => ({ kind: "svc" as const, it })),
      ...g.clients.map((c, ci) => ({ kind: "name" as const, text: `${ci + 1}. ${c.name}` })),
    ].map((r, ri) => ({ ...r, no: ri === 0 ? gi + 1 : null, groupStart: ri === 0 && gi > 0, key: `${gi}-${ri}` }) as Row),
  );
}

function bankRows(bank: InvoicePrintData["bank"]): [string, string][] {
  if (!bank) return [];
  return ([
    ["Bank", bank.bankName],
    ["Branch", bank.branch],
    ["Bank Address", bank.address],
    ["Swiftcode", bank.swiftcode],
    ["Account For", bank.accountFor],
    ["Acc. No", bank.accountNo],
  ] as [string, string | null][]).filter((r): r is [string, string] => Boolean(r[1]));
}

const totals = (inv: InvoicePrintData["invoice"]): [string, number][] =>
  [["Sub Total", inv.subTotal] as [string, number], ...inv.taxes.map((t) => [t.description, t.value] as [string, number]), ["Total Invoice", inv.total]];

function Sign({ company }: { company: InvoicePrintData["company"] }) {
  return (
    <div className="sign">
      <div className="nm">{company?.signedBy}</div>
      <div className="tt">{company?.signedTitle || "Finance"}</div>
    </div>
  );
}

function BankTable({ bank }: { bank: InvoicePrintData["bank"] }) {
  return (
    <table className="bank">
      <tbody>
        {bankRows(bank).map(([k, v]) => <tr key={k}><td className="k">{k}</td><td className="c">:</td><td className="pre">{v}</td></tr>)}
      </tbody>
    </table>
  );
}

// ───────────────────────── SML ─────────────────────────

export function SmlInvoice({ data }: { data: InvoicePrintData }) {
  const { invoice: inv, company, billTo, bank } = data;
  const rows = itemRows(inv);
  return (
    <div className="page sml">
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
                <><td>{r.it.description}</td><td className="pax">{n(r.it.qty)}</td><td className="r">{n(r.it.unitPrice)}</td><td className="r">{n(r.it.subTotal)}</td></>
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
          {totals(inv).map(([lbl, val], i, all) => (
            <tr key={i}><td className={`pad${i === all.length - 1 ? " end" : ""}`} /><td className="lbl">{lbl}</td><td className="val">{n(val)}</td></tr>
          ))}
        </tbody>
      </table>

      <div className="keep">
      <div className="boxes">
        <div className="box-wrap"><div className="t">Important Information</div><div className="box info">{inv.information}</div></div>
        <div className="box-wrap"><div className="t">In Words</div><div className="box words">{words(inv.total)}</div></div>
      </div>

      {bank && (
        <div className="pay">
          <div className="t">Please Transfer The Payment To :</div>
          <div className="box"><BankTable bank={bank} /></div>
        </div>
      )}

      <div className="sign-row"><Sign company={company} /></div>
      {company?.address && <div className="foot">{company.address}</div>}
      </div>
    </div>
  );
}

// ───────────────────────── RTS (PT Raqinna Triniti Sentosa) ─────────────────────────

export function RtsInvoice({ data }: { data: InvoicePrintData }) {
  const { invoice: inv, company, billTo, bank } = data;
  const rows = itemRows(inv);
  const tot = totals(inv);
  return (
    <div className="page rts">
      <header className="head">
        <img className="swoosh" src="/print/rts/bg-top.png" alt="" />
        <img className="logo" src="/print/rts/logo.png" alt={company?.name ?? "Raqinna Triniti Sentosa"} />
        <div className="title">INVOICE</div>
      </header>

      <table className="meta">
        <tbody>
          <tr><td className="k">Invoice To</td><td className="c">:</td><td>{billTo?.companyName}</td></tr>
          {billTo?.address.map((a, i) => <tr key={i}><td /><td /><td>{a}</td></tr>)}
          <tr><td className="k">NPWP</td><td className="c">:</td><td>{inv.npwp || billTo?.npwp}</td></tr>
          <tr><td className="k">Invoice #</td><td className="c">:</td><td>{inv.no}</td></tr>
          <tr><td className="k">Invoice Date</td><td className="c">:</td><td>{dmy(inv.date)}</td></tr>
        </tbody>
      </table>

      <table className="items">
        <thead><tr><th className="no">No</th><th className="d">Item Description</th><th className="r">Price</th><th className="q">Qty</th><th className="r">Total Price</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={`${r.kind}${r.groupStart ? " gs" : ""}${r.no ? " first" : ""}`}>
              <td className="no">{r.no ?? ""}</td>
              {r.kind === "svc" ? (
                <><td>{r.it.description}</td><td className="r">{n(r.it.unitPrice)}</td><td className="q">{n(r.it.qty)}</td><td className="r">{n(r.it.subTotal)}</td></>
              ) : (
                <><td className="nm">{r.text}</td><td /><td /><td /></>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="keep">
        <table className="sum">
          <tbody>
            {tot.map(([lbl, val], i) => (
              <tr key={i} className={i === tot.length - 1 ? "grand" : undefined}><td /><td className="lbl">{lbl} :</td><td className="val">{n(val)}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="words-band"><div>{words(inv.total)}</div></div>

        <div className="cap">Important Information</div>
        <div className="info">{inv.information}</div>

        <div className="pay">
          <img className="swoosh" src="/print/rts/bg-bottom.png" alt="" />
          {bank && (
            <div className="bank-wrap">
              <div className="cap">Please Transfer The Payment To :</div>
              <BankTable bank={bank} />
            </div>
          )}
          <Sign company={company} />
        </div>
      </div>
      {company?.address && <div className="foot">{company.address}</div>}
    </div>
  );
}

// ───────────────────────── JCSS (PT Jassa Ceppat Sukses) ─────────────────────────

export function JcssInvoice({ data }: { data: InvoicePrintData }) {
  const { invoice: inv, company, billTo, bank } = data;
  const rows = itemRows(inv);
  const tot = totals(inv);
  const grand = tot[tot.length - 1];
  return (
    <div className="page jcss">
      <header className="head">
        <img className="logo" src="/print/jcss/logo.png" alt={company?.name ?? "Jassa Ceppat Sukses"} />
        {company?.address && <div className="addr">{company.address}</div>}
      </header>
      <div className="bar"><span className="l" /><span className="title">INVOICE</span><span className="r" /></div>

      <div className="meta">
        <div className="to">
          <div>Invoice To&nbsp;&nbsp;:</div>
          <div className="name">{billTo?.companyName}{billTo?.address.map((a, i) => <div key={i}>{a}</div>)}</div>
          <div>NPWP&nbsp;&nbsp;:&nbsp;&nbsp;{inv.npwp || billTo?.npwp}</div>
        </div>
        <table className="right">
          <tbody>
            <tr><td className="k">Invoice Date</td><td className="c">:</td><td>{dmy(inv.date)}</td></tr>
            <tr><td className="k">Invoice No</td><td className="c">:</td><td>{inv.no}</td></tr>
          </tbody>
        </table>
      </div>

      <table className="items">
        <colgroup><col className="w-no" /><col /><col className="w-pax" /><col className="w-price" /><col className="w-total" /></colgroup>
        <thead><tr><th>No</th><th>Description</th><th>Pax</th><th>Price Per Pax</th><th>Total Price</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={`${r.kind}${r.groupStart ? " gs" : ""}${r.no ? " first" : ""}`}>
              <td className="no">{r.no ?? ""}</td>
              {r.kind === "svc" ? (
                <><td>{r.it.description}</td><td className="q">{n(r.it.qty)}</td><td className="r">{n(r.it.unitPrice)}</td><td className="r">{n(r.it.subTotal)}</td></>
              ) : (
                <><td className="nm">{r.text}</td><td /><td /><td /></>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="keep">
        <table className="sum">
          <colgroup><col /><col className="w-price" /><col className="w-total" /></colgroup>
          <tbody>
            {tot.slice(0, -1).map(([lbl, val], i) => <tr key={i}><td className="blank" /><td className="lbl">{lbl}</td><td className="val">{n(val)}</td></tr>)}
            <tr className="grand"><td className="words">{words(inv.total)}</td><td className="lbl">{grand[0]}</td><td className="val">{n(grand[1])}</td></tr>
          </tbody>
        </table>

        <div className="notes">
          <p>Thank You For Your Business</p>
          <p className="cap">Important Information</p>
          <div className="info">{inv.information}</div>
        </div>

        <div className="pay">
          <div className="bank-wrap">
            <div>Payment Info</div>
            <div>Please Transfer The Payment To :</div>
            <BankTable bank={bank} />
          </div>
          <Sign company={company} />
        </div>
      </div>
    </div>
  );
}
