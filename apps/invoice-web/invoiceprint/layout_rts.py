"""RTS model (PT Raqinna Triniti Sentosa), after RTS-Invoice.pdf.

Grey swoosh header with logo and a large "INVOICE", label/value header,
an open item table (horizontal rules only, columns No / Item Description /
Price / Qty / Total Price), right-aligned totals with the amount in words
on a grey band, boxed Important Information, and bank details over a
grey swoosh.
"""
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, Spacer, Table, TableStyle

from .layout import Backdrop, ClosedTable, asset, asset_path, item_rows, two_template_doc

BAND = colors.HexColor("#F5F5F5")
INK = colors.HexColor("#222222")
W, H = 210 * mm, 297 * mm


def build_rts(data, out):
    st = {
        "lbl": ParagraphStyle("lbl", fontName="Helvetica", fontSize=8.5, leading=11.5),
        "val": ParagraphStyle("val", fontName="Helvetica", fontSize=8.5, leading=11.5),
        "svc": ParagraphStyle("svc", fontName="Helvetica", fontSize=8.5, leading=10.5),
        "name": ParagraphStyle("name", fontName="Helvetica", fontSize=8, leading=10,
                               textColor=colors.HexColor("#444444"), leftIndent=6),
        "note": ParagraphStyle("note", fontName="Helvetica", fontSize=8, leading=10.5),
        "words": ParagraphStyle("words", fontName="Helvetica-Oblique", fontSize=8.5,
                                leading=11, alignment=TA_RIGHT),
        "cap": ParagraphStyle("cap", fontName="Helvetica", fontSize=8.5, leading=11),
    }
    inv_no = data["header"]["Invoice No"][0]
    logo = asset("RTS", "logo.png")
    top = asset("RTS", "bg-top.png")

    def first_page(c, doc):
        # swoosh band across the top, logo left, big INVOICE right
        bw = W - 2 * 7.5 * mm
        bh = bw * top.size[1] / top.size[0]
        c.drawImage(asset_path("RTS", "bg-top.png"), 7.5 * mm, H - 9.5 * mm - bh, bw, bh,
                    mask="auto")
        lw = 47 * mm
        lh = lw * logo.size[1] / logo.size[0]
        c.drawImage(asset_path("RTS", "logo.png"), 15 * mm, H - 13.5 * mm - lh, lw, lh,
                    mask="auto")
        c.setFillColor(colors.black)
        c.setFont("Helvetica", 27)
        c.drawRightString(W - 15 * mm, H - 24 * mm, "INVOICE")

    doc, fw = two_template_doc(out, f"Invoice {inv_no}", first_page, first_top=34 * mm)
    story = []

    # Header: Invoice To / NPWP / Invoice # / Invoice Date
    h = data["header"]
    hdr = [["Invoice To", ":", Paragraph("<br/>".join(h["To"]), st["val"])],
           ["NPWP", ":", h["NPWP"][0]],
           ["Invoice #", ":", inv_no],
           ["Invoice Date", ":", h["Invoice Date"][0]]]
    ht = Table(hdr, colWidths=[22 * mm, 5 * mm, 120 * mm], hAlign="LEFT")
    ht.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                            ("TOPPADDING", (0, 0), (-1, -1), 1.5),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
                            ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    story += [ht, Spacer(1, 5 * mm)]

    # Items: No | Item Description | Price | Qty | Total Price
    cols = ("no", "desc", "price", "pax", "total")
    cw = [16 * mm, 88 * mm, 28 * mm, 16 * mm, fw - 148 * mm]
    body, groups = item_rows(data, st["name"], st["svc"], cols)
    rows = [["No", "Item Description", "Price", "Qty", "Total Price"]] + body
    style = [
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("TEXTCOLOR", (0, 0), (-1, -1), INK),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEABOVE", (0, 0), (-1, 0), 0.8, colors.black),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, colors.black),
        ("TOPPADDING", (0, 0), (-1, 0), 6),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (2, 0), (2, -1), "RIGHT"),
        ("ALIGN", (3, 0), (3, -1), "CENTER"),
        ("ALIGN", (4, 0), (4, -1), "RIGHT"),
        ("TOPPADDING", (0, 1), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 1),
        ("LINEBELOW", (0, -1), (-1, -1), 0.8, colors.black),
    ]
    for start, n_svc, last in groups:
        s, e = start + 1, last + 1  # +1 for the header row
        style.append(("NOSPLIT", (0, s), (-1, s + n_svc)))
        style.append(("TOPPADDING", (0, s), (-1, s), 5))
        style.append(("BOTTOMPADDING", (0, e), (-1, e), 4))
        if start:
            style.append(("LINEABOVE", (0, s), (-1, s), 0.3, colors.HexColor("#CCCCCC")))
    t = ClosedTable(rows, colWidths=cw, repeatRows=1)
    t.setStyle(TableStyle(style))
    story.append(t)

    # Totals (right aligned) + amount in words on a grey band
    labels = [(lbl if lbl.endswith(":") else f"{lbl} :", val) for lbl, val in data["totals"]]
    tt = Table([["", lbl, val] for lbl, val in labels],
               colWidths=[fw - 75 * mm, 42 * mm, 33 * mm])
    tt.setStyle(TableStyle([("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                            ("FONTNAME", (1, -1), (-1, -1), "Helvetica-Bold"),
                            ("TOPPADDING", (0, 0), (-1, -1), 2.5),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5)]))
    band = Table([["", Paragraph(data["words"], st["words"])]],
                 colWidths=[fw - 108 * mm, 108 * mm])
    band.setStyle(TableStyle([("BACKGROUND", (1, 0), (1, 0), BAND),
                              ("TOPPADDING", (0, 0), (-1, -1), 5),
                              ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))

    notes = Paragraph("<br/>".join(data["notes"]), st["note"])
    info = Table([[Paragraph("Important Information", st["cap"])], [notes]], colWidths=[fw])
    info.setStyle(TableStyle([("BOX", (0, 1), (0, 1), 0.8, colors.black),
                              ("LEFTPADDING", (0, 0), (0, 0), 0),
                              ("LEFTPADDING", (0, 1), (0, 1), 6),
                              ("TOPPADDING", (0, 1), (0, 1), 4),
                              ("BOTTOMPADDING", (0, 1), (0, 1), 6)]))

    bank_rows = [[k, ":", Paragraph(v.replace("\n", "<br/>"), st["val"])] for k, v in data["bank"]]
    bt = Table([["Please Transfer The Payment To :", "", ""]] + bank_rows,
               colWidths=[28 * mm, 5 * mm, 100 * mm], hAlign="LEFT")
    bt.setStyle(TableStyle([("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                            ("SPAN", (0, 0), (-1, 0)),
                            ("BOTTOMPADDING", (0, 0), (-1, 0), 4),
                            ("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("LEFTPADDING", (0, 0), (-1, -1), 0),
                            ("TOPPADDING", (0, 1), (-1, -1), 1),
                            ("BOTTOMPADDING", (0, 1), (-1, -1), 1)]))
    name, role = (data["sign"] + ["", ""])[:2]
    sg = Table([[name], [role]], colWidths=[60 * mm], rowHeights=[5 * mm, 5 * mm])
    sg.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"),
                            ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                            ("LINEBELOW", (0, 0), (0, 0), 0.8, colors.black)]))
    pay = Table([[bt, ""], ["", sg]], colWidths=[fw - 62 * mm, 62 * mm])
    pay.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
                             ("LEFTPADDING", (0, 0), (-1, -1), 0),
                             ("TOPPADDING", (0, 1), (-1, 1), 8),
                             ("BOTTOMPADDING", (0, 1), (-1, 1), 6)]))
    swoosh = asset("RTS", "bg-bottom.png")
    sw_w = W - 7.5 * mm
    sw_h = sw_w * swoosh.size[1] / swoosh.size[0]
    pay_bg = Backdrop(pay, asset_path("RTS", "bg-bottom.png"), sw_w, sw_h, 15 * mm - 7.5 * mm)

    story.append(KeepTogether([tt, band, Spacer(1, 4 * mm), info, Spacer(1, 6 * mm), pay_bg]))
    doc.build(story)
