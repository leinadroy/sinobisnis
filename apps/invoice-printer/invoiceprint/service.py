"""Produce everything for one invoice, read-only from the database:

    <out_root>/<InvoiceNo>/
        Invoice-<InvoiceNo>.pdf                    invoice only
        Invoice-<InvoiceNo>-with-attachments.pdf   invoice + all attachments, bookmarked
        attachments/                               one file per attachment + index.csv

Table mapping: see docs/invoice-mapping.md in the project root.
"""
import csv
import io
import re
from pathlib import Path
from xml.sax.saxutils import escape

from pypdf import PdfReader, PdfWriter

from .db import connect, query
from .layout import build, fix, model_of

APP_DIR = Path(__file__).resolve().parent.parent
NAME_RE = re.compile(r"^\s*\d+\.\s")
MAGIC = {b"%PDF": "pdf", b"\xff\xd8\xff": "jpg", b"\x89PNG": "png", b"PK\x03\x04": "zip"}


def money(v):
    return f"{v:,}"


def safe(name):
    return re.sub(r"[^\w\- ]+", "", name or "").strip().replace(" ", "_") or "Unknown"


def ext_of(data):
    for sig, ext in MAGIC.items():
        if data.startswith(sig):
            return ext
    return "bin"


def find_invoice(key):
    """Accept an invoice number (26351/SML/X/2026) or an InvoiceId (2334)."""
    key = key.strip()
    rows = query("SELECT InvoiceId, InvoiceNo FROM invoice WHERE InvoiceNo = %s", (key,))
    if not rows and key.isdigit():
        rows = query("SELECT InvoiceId, InvoiceNo FROM invoice WHERE InvoiceId = %s", (int(key),))
    if not rows:
        raise LookupError(f"Invoice '{key}' tidak ditemukan (cek nomor invoice atau InvoiceId).")
    return rows[0]


def load(invoice_id):
    inv = query(
        "SELECT i.*, b.BillToAlamatBaris1, b.BillToAlamatBaris2, b.BillToAlamatBaris3, "
        "       b.BillToAlamatBaris4, ba.*, c.CompanyInvoiceSignedBy, c.CompanyAddress "
        "FROM invoice i "
        "LEFT JOIN billto b       ON b.BillToId = i.BillToId "
        "LEFT JOIN bankaccount ba ON ba.BankAccountId = i.BankAccountId "
        "LEFT JOIN company c      ON c.CompanyId = i.InvoiceCompanyId "
        "WHERE i.InvoiceId = %s", (invoice_id,))[0]
    details = query(
        "SELECT InvoiceDetailDescription d, InvoiceDetailQty q, InvoiceDetailUnitPrice p, "
        "       InvoiceDetailSubTotal s "
        "FROM invoicedetail WHERE InvoiceDetailInvoiceId = %s ORDER BY InvoiceDetailId",
        (invoice_id,))
    taxes = query(
        "SELECT InvoiceTaxDescription d, InvoiceTaxValue v FROM invoicetax "
        "WHERE InvoiceTaxInvoiceId = %s ORDER BY InvoiceTaxId", (invoice_id,))

    # Item numbering is not stored: a service line (Qty > 0) that follows a
    # name line (Qty = 0) starts a new item.
    # A few name lines ("12. Zhu Yanhua") were saved with a Qty but no price;
    # they are still names, not services.
    items, prev_was_name = [], True
    for r in details:
        desc = escape(fix((r["d"] or "").strip()))
        stray_name = not r["p"] and not r["s"] and NAME_RE.match(r["d"] or "")
        if r["q"] and r["q"] > 0 and not stray_name:
            if prev_was_name or not items:
                items.append({"no": str(len(items) + 1), "services": [], "names": []})
            items[-1]["services"].append([desc, str(r["q"]), money(r["p"]), money(r["s"])])
            prev_was_name = False
        else:
            if not items:
                items.append({"no": "1", "services": [], "names": []})
            items[-1]["names"].append(desc)
            prev_was_name = True

    to = [inv["InvoiceBilledTo"]] + [inv[f"BillToAlamatBaris{i}"] for i in range(1, 5)]
    addr = [inv[f"BankAccountAddress{i}"] for i in range(1, 5)]
    return {
        "header": {
            "Invoice Date": [inv["InvoiceDate"].strftime("%d/%m/%Y")],
            "Invoice No": [escape(inv["InvoiceNo"])],
            "To": [escape(x.strip()) for x in to if x and x.strip()],
            "NPWP": [escape(inv["InvoiceNPWP"] or "")],
        },
        "items": items,
        "totals": [("Sub Total", money(inv["InvoiceSubTotal"]))]
                  + [(t["d"], money(t["v"])) for t in taxes]
                  + [("Total Invoice", money(inv["InvoiceTotal"]))],
        "notes": [escape(x.strip()) for x in (inv["AdditionalInformation"] or "").splitlines()
                  if x.strip()],
        "words": escape(inv["InvoiceTotalTerbilang"] or ""),
        "bank": [[k, escape(fix(v))] for k, v in [
            ("Bank", inv["BankAccountBankName"]),
            ("Branch", inv["BankAccountBranch"]),
            ("Bank Address", "\n".join(a.strip() for a in addr if a and a.strip())),
            ("Swiftcode", inv["BankAccountSwiftcode"]),
            ("Account For", inv["BankAccountAccountFor"]),
            ("Acc. No", inv["BankAccountNo"]),
        ] if v],
        "sign": [inv["CompanyInvoiceSignedBy"] or "", "Finance"],
        "model": model_of(inv["InvoiceNo"]),
        "company_address": escape(inv["CompanyAddress"] or ""),
        "_inv": inv,
    }


def attachment_list(invoice_id):
    """Attachments in invoice order: by the client's first detail line."""
    order = {}
    for r in query("SELECT InvoiceDetailClientNo c FROM invoicedetail "
                   "WHERE InvoiceDetailInvoiceId = %s AND InvoiceDetailClientNo <> 0 "
                   "ORDER BY InvoiceDetailId", (invoice_id,)):
        order.setdefault(r["c"], len(order) + 1)
    rows = query(
        "SELECT a.AttachmentId id, a.AttachmentClientNo client, c.ClientName name "
        "FROM invoiceattachment ia "
        "JOIN attachment a ON a.AttachmentId = ia.InvoiceAttachmentIdInvoice "
        "LEFT JOIN client c ON c.ClientNo = a.AttachmentClientNo "
        "WHERE ia.InvoiceAttachmentInvoiceId = %s", (invoice_id,))
    for r in rows:
        r["order"] = order.get(r["client"], 999)
    return sorted(rows, key=lambda r: (r["order"], r["id"]))


def process(key, out_root, log=print, progress=lambda done, total: None):
    """Build invoice PDF, export attachments, and merge. Returns the output folder."""
    found = find_invoice(key)
    inv_id, inv_no = found["InvoiceId"], found["InvoiceNo"]
    tag = inv_no.replace("/", "-")
    out = Path(out_root) / safe(tag)
    att_dir = out / "attachments"
    att_dir.mkdir(parents=True, exist_ok=True)
    log(f"Invoice {inv_no} (InvoiceId {inv_id}) - model {model_of(inv_no)}")

    # 1. invoice PDF
    data = load(inv_id)
    buf = io.BytesIO()
    build(data, buf)
    invoice_pdf = out / f"Invoice-{tag}.pdf"
    invoice_pdf.write_bytes(buf.getvalue())
    n_names = sum(len(i["names"]) for i in data["items"])
    log(f"[1/3] Invoice: {len(data['items'])} item, {n_names} nama, "
        f"total {money(data['_inv']['InvoiceTotal'])} -> {invoice_pdf.name}")

    # 2 + 3. export each attachment and append it to the merged PDF in one pass
    atts = attachment_list(inv_id)
    log(f"[2/3] Lampiran: {len(atts)} file")
    writer = PdfWriter()
    writer.append(PdfReader(io.BytesIO(buf.getvalue())), outline_item=f"Invoice {inv_no}")
    parent = writer.add_outline_item(f"Attachments ({len(atts)})", len(writer.pages)) if atts else None
    index, skipped = [], []
    conn = connect()  # READ ONLY session
    try:
        with conn.cursor() as cur:
            for i, r in enumerate(atts, 1):
                cur.execute("SELECT AttachmentBlob b FROM attachment WHERE AttachmentId = %s",
                            (r["id"],))
                blob = (cur.fetchone() or {}).get("b") or b""
                fname = f"{r['order']:03d}_{safe(r['name'])}_{r['id']}.{ext_of(blob)}"
                (att_dir / fname).write_bytes(blob)
                index.append({"file": fname, "order_in_invoice": r["order"],
                              "client_no": r["client"], "client_name": r["name"],
                              "attachment_id": r["id"], "bytes": len(blob)})
                if blob.startswith(b"%PDF"):
                    start = len(writer.pages)
                    try:
                        writer.append(PdfReader(io.BytesIO(blob)))
                        writer.add_outline_item(f"{r['order']:03d} {r['name']} ({r['id']})",
                                                start, parent=parent)
                    except Exception as e:  # damaged PDF: keep the file, skip the merge
                        skipped.append(f"{fname} ({e})")
                else:
                    skipped.append(f"{fname} (bukan PDF)")
                progress(i, len(atts))
    finally:
        conn.close()
    with open(att_dir / "index.csv", "w", newline="", encoding="utf-8") as f:
        fields = ["file", "order_in_invoice", "client_no", "client_name", "attachment_id", "bytes"]
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(index)

    merged_pdf = out / f"Invoice-{tag}-with-attachments.pdf"
    log("[3/3] Menggabungkan PDF...")
    writer.compress_identical_objects()
    with open(merged_pdf, "wb") as f:
        writer.write(f)
    log(f"      -> {merged_pdf.name} ({len(writer.pages)} halaman, "
        f"{merged_pdf.stat().st_size / 1048576:.1f} MB)")
    for s in skipped:
        log(f"      ! tidak digabung: {s}")
    log(f"Selesai. Folder: {out}")
    return out
