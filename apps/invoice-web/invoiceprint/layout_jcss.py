"""JCSS model (PT Jassa Ceppat Sukses), after JCSS-Invoice.pdf.

Logo left with the company address top right, an orange bar with
"INVOICE", Invoice To on the left and Invoice Date / No on the right, a
fully ruled item table with an orange header (No / Description / Pax /
Price Per Pax / Total Price), totals with the amount in words beside
Total Invoice, then Important Information, Payment Info and the
signature beside the bank details.
"""
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, Spacer, Table, TableStyle

from .layout import ClosedTable, asset, asset_path, item_rows, two_template_doc

ORANGE = colors.HexColor("#FF7F50")
W, H = 210 * mm, 297 * mm


def build_jcss(data, out):
    st = {
        "val": ParagraphStyle("val", fontName="Helvetica", fontSize=8.5, leading=11.5),
        "th": ParagraphStyle("th", fontName="Helvetica", fontSize=8.5, leading=10.5,
                             textColor=colors.white, alignment=1),
        "svc": ParagraphStyle("svc", fontName="Helvetica", fontSize=8.5, leading=10.5),
        "name": ParagraphStyle("name", fontName="Helvetica", fontSize=8, leading=10,
                               textColor=colors.HexColor("#333333")),
        "note": ParagraphStyle("note", fontName="Helvetica", fontSize=8.5, leading=11),
        "words": ParagraphStyle("words", fontName="Helvetica", fontSize=8.5, leading=10.5),
        "addr": ParagraphStyle("addr", fontName="Helvetica", fontSize=8.5, leading=10.5,
                               alignment=2),
    }
    inv_no = data["header"]["Invoice No"][0]
    logo = asset("JCSS", "logo.png")
    address = data.get("company_address") or ""

    def first_page(c, doc):
        lw = 47 * mm
        lh = lw * logo.size[1] / logo.size[0]
        c.drawImage(asset_path("JCSS", "logo.png"), 15 * mm, H - 13.5 * mm - lh, lw, lh,
                    mask="auto")
        if address:
            p = Paragraph(address, st["addr"])
            pw, ph = p.wrap(95 * mm, 30 * mm)
            p.drawOn(c, W - 15 * mm - pw, H - 21 * mm - ph / 2)
        # orange bar split by the word INVOICE
        c.setFillColor(ORANGE)
        c.rect(9.5 * mm, H - 37 * mm, 138 * mm, 7.5 * mm, stroke=0, fill=1)
        c.rect(W - 23 * mm, H - 37 * mm, 23 * mm, 7.5 * mm, stroke=0, fill=1)
        c.setFillColor(colors.black)
        c.setFont("Helvetica", 24)
        c.drawCentredString((147.5 * mm + W - 23 * mm) / 2, H - 36 * mm, "INVOICE")

    doc, fw = two_template_doc(out, f"Invoice {inv_no}", first_page, first_top=41 * mm,
                               side=16 * mm)
    story = []

    # Header: Invoice To + NPWP on the left, Invoice Date / No on the right
    h = data["header"]
    to = Paragraph("<br/>".join(h["To"]), st["val"])
    right = Table([["Invoice Date", ":", h["Invoice Date"][0]],
                   ["Invoice No", ":", inv_no]], colWidths=[24 * mm, 5 * mm, 40 * mm])
    right.setStyle(TableStyle([("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                               ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                               ("LEFTPADDING", (0, 0), (-1, -1), 0),
                               ("TOPPADDING", (0, 0), (-1, -1), 1),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    hdr = Table([["Invoice To  :", ""],
                 [to, ""],
                 [f"NPWP  :  {h['NPWP'][0]}", right]],
                colWidths=[fw - 71 * mm, 71 * mm])
    hdr.setStyle(TableStyle([("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                             ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                             ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
                             ("LEFTPADDING", (0, 0), (-1, -1), 0),
                             ("TOPPADDING", (0, 1), (-1, 1), 4),
                             ("BOTTOMPADDING", (0, 1), (-1, 1), 6)]))
    story += [hdr, Spacer(1, 4 * mm)]

    # Items: ruled table with orange header
    cols = ("no", "desc", "pax", "price", "total")
    cw = [24 * mm, 72 * mm, 13 * mm, 32 * mm, fw - 141 * mm]
    body, groups = item_rows(data, st["name"], st["svc"], cols)
    rows = [[Paragraph(x, st["th"]) for x in
             ("No", "Description", "Pax", "Price Per Pax", "Total Price")]] + body
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), ORANGE),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 8.5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.8, colors.black),
        ("LINEAFTER", (0, 0), (-2, -1), 0.6, colors.black),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, colors.black),
        ("ALIGN", (0, 1), (0, -1), "CENTER"),
        ("ALIGN", (2, 1), (2, -1), "CENTER"),
        ("ALIGN", (3, 1), (-1, -1), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, 0), 2),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
        ("TOPPADDING", (0, 1), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 1),
    ]
    for start, n_svc, last in groups:
        s, e = start + 1, last + 1
        style.append(("NOSPLIT", (0, s), (-1, s + n_svc)))
        style.append(("TOPPADDING", (0, s), (-1, s), 3))
        style.append(("BOTTOMPADDING", (0, e), (-1, e), 4))
        if start:
            style.append(("LINEABOVE", (0, s), (-1, s), 0.6, colors.black))
    t = ClosedTable(rows, colWidths=cw, repeatRows=1)
    t.setStyle(TableStyle(style))
    story.append(t)

    # Totals: label in the price column, value in the total column; the
    # amount in words sits beside "Total Invoice".
    left_w = cw[0] + cw[1] + cw[2]
    trows = [["", lbl, val] for lbl, val in data["totals"][:-1]]
    trows.append([Paragraph(data["words"], st["words"]), data["totals"][-1][0],
                  data["totals"][-1][1]])
    tt = Table(trows, colWidths=[left_w, cw[3], cw[4]])
    tt.setStyle(TableStyle([("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                            ("BOX", (0, 0), (-1, -1), 0.8, colors.black),
                            ("GRID", (1, 0), (-1, -1), 0.6, colors.black),
                            ("LINEABOVE", (0, -1), (-1, -1), 0.6, colors.black),
                            ("FONTNAME", (1, -1), (-1, -1), "Helvetica-Bold"),
                            ("TOPPADDING", (0, 0), (-1, -1), 2),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))

    info = [Paragraph("Thank You For Your Business", st["note"]), Spacer(1, 5 * mm),
            Paragraph("Important Information", st["note"]), Spacer(1, 1 * mm),
            Table([[Paragraph("<br/>".join(data["notes"]), st["note"])]], colWidths=[95 * mm],
                  style=[("LEFTPADDING", (0, 0), (-1, -1), 0)], hAlign="LEFT")]

    bank_rows = [[k, ":", Paragraph(v.replace("\n", "<br/>"), st["val"])] for k, v in data["bank"]]
    bt = Table([["Payment Info", "", ""], ["Please Transfer The Payment To :", "", ""]] + bank_rows,
               colWidths=[28 * mm, 5 * mm, 72 * mm], hAlign="LEFT")
    bt.setStyle(TableStyle([("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                            ("SPAN", (0, 0), (-1, 0)), ("SPAN", (0, 1), (-1, 1)),
                            ("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("LEFTPADDING", (0, 0), (-1, -1), 0),
                            ("TOPPADDING", (0, 0), (-1, -1), 1),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    name, role = (data["sign"] + ["", ""])[:2]
    sg = Table([[name], [role]], colWidths=[62 * mm], rowHeights=[5 * mm, 5 * mm])
    sg.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"),
                            ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                            ("LINEBELOW", (0, 0), (0, 0), 0.8, colors.black)]))
    pay = Table([[bt, sg]], colWidths=[fw - 62 * mm, 62 * mm])
    pay.setStyle(TableStyle([("VALIGN", (0, 0), (0, 0), "TOP"),
                             ("VALIGN", (1, 0), (1, 0), "BOTTOM"),
                             ("LEFTPADDING", (0, 0), (-1, -1), 0),
                             ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                             ("BOTTOMPADDING", (1, 0), (1, 0), 6)]))

    story.append(KeepTogether([tt, Spacer(1, 7 * mm)] + info + [Spacer(1, 12 * mm), pay]))
    doc.build(story)
