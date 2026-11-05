import { cookies } from "next/headers";
import type { InvoiceDetail } from "@sml/shared";
import { API_URL, TOKEN_COOKIE } from "@/lib/api";
import { mergeInvoicePdf, PdfError, renderInvoicePdf } from "@/lib/invoice-pdf";

export const runtime = "nodejs";
export const maxDuration = 300;

const fileName = (no: string | null, id: string, suffix: string) => `Invoice-${(no || id).replace(/[^\w.-]+/g, "-")}${suffix}.pdf`;

/**
 * PDF invoice dari server. `?attachments=1` = invoice + semua lampiran digabung (bookmark per lampiran,
 * urutan sesuai client di invoice). Hak akses mengikuti API (menu Invoice, lihat).
 */
export async function GET(req: Request, { params }: RouteContext<"/bff/invoices/[id]/pdf">) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return Response.json({ message: "Invoice tidak ditemukan." }, { status: 404 });
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) return Response.json({ message: "Belum login." }, { status: 401 });
  const withAttachments = new URL(req.url).searchParams.get("attachments") === "1";

  const api = (path: string) => fetch(`${API_URL}${path}`, { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
  try {
    const detailRes = await api(`/invoices/${id}`);
    if (!detailRes.ok) {
      const body = await detailRes.json().catch(() => ({}));
      return Response.json({ message: body.message ?? "Invoice tidak bisa dibuka." }, { status: detailRes.status });
    }
    const detail = (await detailRes.json()) as InvoiceDetail;
    const invoicePdf = await renderInvoicePdf(Number(id), token);

    let bytes: Uint8Array = invoicePdf;
    let suffix = "";
    const headers: Record<string, string> = { "Content-Type": "application/pdf", "Cache-Control": "no-store" };
    if (withAttachments) {
      const atts = [];
      for (const [i, a] of detail.attachments.entries()) {
        const r = await api(`/invoices/attachments/${a.id}/file`);
        const fileBytes = r.ok ? new Uint8Array(await r.arrayBuffer()) : new Uint8Array();
        const who = a.clientName ? `${a.clientName} - ` : "";
        atts.push({ title: `${String(i + 1).padStart(3, "0")} ${who}${a.originalName}`, bytes: fileBytes });
      }
      const merged = await mergeInvoicePdf(invoicePdf, detail.no ?? `#${id}`, atts);
      bytes = merged.bytes;
      suffix = "-with-attachments";
      headers["X-Attachments-Merged"] = String(merged.merged);
      headers["X-Attachments-Skipped"] = String(merged.skipped.length);
    }
    headers["Content-Disposition"] = `inline; filename="${fileName(detail.no, id, suffix)}"`;
    return new Response(Buffer.from(bytes), { headers });
  } catch (e) {
    const status = e instanceof PdfError ? e.status : 500;
    const message = e instanceof Error ? e.message : "Gagal membuat PDF.";
    return new Response(`<!doctype html><meta charset="utf-8"><title>PDF gagal</title><body style="font-family:sans-serif;padding:24px"><h3>PDF gagal dibuat</h3><p>${message.replace(/</g, "&lt;")}</p></body>`,
      { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}
