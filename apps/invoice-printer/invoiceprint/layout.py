"""Invoice PDF layout (ReportLab): shared helpers, the SML model, and the
dispatcher that picks a model from the invoice number prefix.

    .../SML/...   -> build_sml   (this file, modelled on SML-Invoice.pdf)
    .../RTS/...   -> build_rts   (layout_rts.py, modelled on RTS-Invoice.pdf)
    .../JCSS/...  -> build_jcss  (layout_jcss.py, modelled on JCSS-Invoice.pdf)

Clean page breaks: the item table is closed at the bottom of every page,
the column header repeats, and the totals/bank/signature block is never
split across pages. Known typos in DB text are fixed via CORRECTIONS.
"""
import io
import re
from pathlib import Path

from PIL import Image as PILImage

from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (Flowable, Image, KeepTogether, Paragraph,
                                SimpleDocTemplate, Spacer, Table, TableStyle)

BLUE = colors.HexColor("#1565C0")
LIGHT = colors.HexColor("#FBF7F5")
GRID = colors.HexColor("#9E9E9E")
ASSETS = Path(__file__).resolve().parent.parent / "assets"
MODELS = ("SML", "RTS", "JCSS")
# Typos in the source invoice, fixed on the way through (regex -> replacement).
CORRECTIONS = [
    (r"\bConversation to ITAS\b", "Conversion to ITAS"),
    (r"\bE-Voa\b", "E-VoA"),
    (r"Jakarta Selatan 1295$", "Jakarta Selatan 12950"),
]


def fix(text):
    for pat, rep in CORRECTIONS:
        text = re.sub(pat, rep, text, flags=re.M)
    return text


class ClosedTable(Table):
    """Table that draws a bottom border on every page it breaks across.

    ReportLab's 'splitlast' style only survives the first split, so a long
    table loses its bottom line from page 2 onwards. Adding the line to each
    piece as it is split works for any number of pages.
    """

    def split(self, availWidth, availHeight):
        parts = super().split(availWidth, availHeight)
        if len(parts) == 2:
            parts[0].setStyle([("LINEBELOW", (0, -1), (-1, -1), 0.8, colors.black)])
            parts[1].__class__ = ClosedTable
        return parts


def pil_image(pil, width):
    buf = io.BytesIO()
    pil.save(buf, "PNG")
    buf.seek(0)
    w, h = pil.size
    im = Image(buf, width=width, height=width * h / w)
    im.hAlign = "LEFT"
    return im


def model_of(invoice_no):
    """'26351/SML/X/2026' -> 'SML'. Unknown prefixes fall back to SML."""
    parts = (invoice_no or "").upper().split("/")
    for p in parts[1:2] + parts:
        if p in MODELS:
            return p
    return "SML"


def asset(model, name):
    return PILImage.open(ASSETS / model.lower() / name)


def asset_path(model, name):
    return str(ASSETS / model.lower() / name)


def two_template_doc(out, title, first_page, first_top, later_top=12 * mm,
                     side=15 * mm, bottom=12 * mm):
    """A4 doc whose first page reserves `first_top` for a canvas-drawn header
    (`first_page(canvas, doc)`); later pages use a normal top margin."""
    from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate
    W, H = 210 * mm, 297 * mm
    doc = BaseDocTemplate(out, pagesize=(W, H), leftMargin=side, rightMargin=side,
                          topMargin=later_top, bottomMargin=bottom, title=title,
                          author="Sinobisnis Group")
    fw = W - 2 * side
    first = Frame(side, bottom, fw, H - first_top - bottom, id="first",
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    later = Frame(side, bottom, fw, H - later_top - bottom, id="later",
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate("first", [first], onPage=first_page,
                                       autoNextPageTemplate="later"),
                          PageTemplate("later", [later])])
    return doc, fw


def item_rows(data, name_style, svc_style, cols):
    """Flatten items into table rows plus per-item row ranges.

    `cols` orders the cells: e.g. ("no", "desc", "pax", "price", "total").
    Returns (rows, groups) where groups = [(first_row, n_service_rows, last_row)]
    with row indexes relative to the returned list.
    """
    rows, groups = [], []
    for it in data["items"]:
        start = len(rows)
        for k, (d, pax, price, total) in enumerate(it["services"]):
            cell = {"no": it["no"] if k == 0 else "", "desc": Paragraph(d, svc_style),
                    "pax": pax, "price": price, "total": total}
            rows.append([cell[c] for c in cols])
        for n in it["names"]:
            cell = {"no": "", "desc": Paragraph(n, name_style), "pax": "", "price": "", "total": ""}
            rows.append([cell[c] for c in cols])
        groups.append((start, len(it["services"]), len(rows) - 1))
    return rows, groups


class Backdrop(Flowable):
    """Draws an image behind a flowable, anchored to the block's bottom and
    stretched across the full page width (used for the RTS swoosh)."""

    def __init__(self, inner, image_path, img_w, img_h, x_offset):
        super().__init__()
        self.inner, self.image_path = inner, image_path
        self.img_w, self.img_h, self.x_offset = img_w, img_h, x_offset

    def wrap(self, aw, ah):
        self.width, self.height = self.inner.wrap(aw, ah)
        return self.width, self.height

    def split(self, aw, ah):
        return []

    def draw(self):
        self.canv.drawImage(self.image_path, -self.x_offset, -4 * mm, self.img_w, self.img_h,
                            mask="auto")
        self.inner.drawOn(self.canv, 0, 0)


def build(data, out):
    model = data.get("model") or model_of(data["header"]["Invoice No"][0])
    if model == "RTS":
        from .layout_rts import build_rts as fn
    elif model == "JCSS":
        from .layout_jcss import build_jcss as fn
    else:
        fn = build_sml
    fn(data, out)


def build_sml(data, out):
    st = {
        "lbl": ParagraphStyle("lbl", fontName="Helvetica-Bold", fontSize=8.5, leading=11),
        "val": ParagraphStyle("val", fontName="Helvetica", fontSize=8.5, leading=11),
        "th": ParagraphStyle("th", fontName="Helvetica-Bold", fontSize=9, leading=11,
                             textColor=colors.white, alignment=1),
        "svc": ParagraphStyle("svc", fontName="Helvetica", fontSize=9, leading=11),
        "name": ParagraphStyle("name", fontName="Helvetica", fontSize=8, leading=10,
                               textColor=colors.HexColor("#333333"), leftIndent=6),
        "note": ParagraphStyle("note", fontName="Helvetica", fontSize=8, leading=10.5,
                               alignment=TA_JUSTIFY),
        "words": ParagraphStyle("words", fontName="Helvetica-BoldOblique", fontSize=10,
                                leading=13),
        "cap": ParagraphStyle("cap", fontName="Helvetica-Bold", fontSize=9, leading=11),
    }
    W = 186 * mm  # usable width on A4 with 12 mm margins
    story = []

    # Header block
    story.append(pil_image(asset("SML", "logo.png"), 72 * mm))
    story.append(Spacer(1, 3 * mm))
    story.append(pil_image(asset("SML", "invoice-banner.png"), 43 * mm))
    story.append(Spacer(1, 4 * mm))
    hdr_rows = []
    for label, vals in data["header"].items():
        hdr_rows.append([Paragraph(label, st["lbl"]), ":",
                         Paragraph("<br/>".join(vals), st["val"])])
    ht = Table(hdr_rows, colWidths=[28 * mm, 4 * mm, 120 * mm], hAlign="LEFT")
    ht.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                            ("TOPPADDING", (0, 0), (-1, -1), 1.5),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
                            ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    story += [ht, Spacer(1, 4 * mm)]

    # Item table: one row per service line and per name, so it can break cleanly.
    cw = [12 * mm, 94 * mm, 14 * mm, 31 * mm, 35 * mm]
    rows = [[Paragraph(h, st["th"]) for h in
             ("No", "Description", "Pax", "Price Per Pax", "Total Price")]]
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), BLUE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.8, colors.black),
        ("LINEAFTER", (0, 0), (-2, -1), 0.5, GRID),
        ("ALIGN", (0, 1), (0, -1), "CENTER"),
        ("ALIGN", (2, 1), (2, -1), "CENTER"),
        ("ALIGN", (3, 1), (-1, -1), "RIGHT"),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 9),
        ("TOPPADDING", (0, 1), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 1),
    ]
    for it in data["items"]:
        start = len(rows)
        for k, (d, pax, price, total) in enumerate(it["services"]):
            rows.append([it["no"] if k == 0 else "", Paragraph(d, st["svc"]), pax, price, total])
        for n in it["names"]:
            rows.append(["", Paragraph(n, st["name"]), "", "", ""])
        # keep an item's service lines (and its first name) on the same page
        style.append(("NOSPLIT", (0, start), (-1, start + len(it["services"]))))
        style.append(("TOPPADDING", (0, start), (-1, start), 4))
        style.append(("LINEABOVE", (0, start), (-1, start), 0.4, GRID))
        style.append(("BOTTOMPADDING", (0, len(rows) - 1), (-1, len(rows) - 1), 4))
    t = ClosedTable(rows, colWidths=cw, repeatRows=1)
    t.setStyle(TableStyle(style))
    story.append(t)

    # Totals + notes + bank + signature: kept together so nothing is cut.
    tot_rows = [["", lbl, val] for lbl, val in data["totals"]]
    tt = Table(tot_rows, colWidths=[cw[0] + cw[1] + cw[2], cw[3], cw[4]])
    tt.setStyle(TableStyle([
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (1, 0), (-1, -1), 0.5, colors.black),
        ("BOX", (0, 0), (-1, -1), 0.8, colors.black),
        ("FONTNAME", (1, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND", (1, -1), (-1, -1), colors.HexColor("#E3F2FD")),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))

    notes = Paragraph(" ".join(data["notes"]).replace(" 2. ", "<br/>2. "), st["note"])
    words = Paragraph(data["words"], st["words"])
    nt = Table([[Paragraph("Important Information", st["cap"]), "", Paragraph("In Words", st["cap"])],
                [notes, "", words]],
               colWidths=[90 * mm, 6 * mm, 90 * mm])
    nt.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 1), (0, 1), 0.6, colors.black),
        ("BOX", (2, 1), (2, 1), 0.6, colors.black),
        ("BACKGROUND", (0, 1), (0, 1), LIGHT),
        ("BACKGROUND", (2, 1), (2, 1), LIGHT),
        ("LEFTPADDING", (0, 0), (-1, 0), 0),
        ("TOPPADDING", (0, 1), (-1, 1), 6),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 8),
        ("LEFTPADDING", (0, 1), (-1, 1), 7),
        ("RIGHTPADDING", (0, 1), (-1, 1), 7),
    ]))

    bank_rows = [[Paragraph(k, st["lbl"]), ":", Paragraph(v.replace("\n", "<br/>"), st["val"])]
                 for k, v in data["bank"]]
    bt_inner = Table(bank_rows, colWidths=[30 * mm, 4 * mm, 140 * mm])
    bt_inner.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                                  ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                                  ("TOPPADDING", (0, 0), (-1, -1), 1),
                                  ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    bt = Table([[Paragraph("Please Transfer The Payment To :", st["cap"])], [bt_inner]],
               colWidths=[W])
    bt.setStyle(TableStyle([("BOX", (0, 1), (0, 1), 0.6, colors.black),
                            ("BACKGROUND", (0, 1), (0, 1), LIGHT),
                            ("LEFTPADDING", (0, 0), (0, 0), 0),
                            ("TOPPADDING", (0, 1), (0, 1), 5),
                            ("BOTTOMPADDING", (0, 1), (0, 1), 5)]))

    name, role = (data["sign"] + ["", ""])[:2]
    sg = Table([["", name], ["", role]], colWidths=[W - 60 * mm, 60 * mm], rowHeights=[22 * mm, 5 * mm])
    sg.setStyle(TableStyle([("ALIGN", (1, 0), (1, -1), "CENTER"),
                            ("VALIGN", (1, 0), (1, 0), "BOTTOM"),
                            ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                            ("FONTSIZE", (0, 0), (-1, -1), 9),
                            ("LINEABOVE", (1, 1), (1, 1), 0.8, colors.black)]))

    story.append(KeepTogether([tt, Spacer(1, 6 * mm), nt, Spacer(1, 5 * mm), bt, Spacer(1, 2 * mm), sg]))

    inv_no = data["header"].get("Invoice No", [""])[0]
    doc = SimpleDocTemplate(out, pagesize=(210 * mm, 297 * mm), leftMargin=12 * mm,
                            rightMargin=12 * mm, topMargin=12 * mm, bottomMargin=12 * mm,
                            title=f"Invoice {inv_no}", author="PT Sinobisnis Mitra Lestari")
    doc.build(story)
