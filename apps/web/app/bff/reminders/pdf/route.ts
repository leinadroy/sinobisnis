import { cookies } from "next/headers";
import { REMINDER_TYPES, todayStr } from "@sml/shared";
import { TOKEN_COOKIE } from "@/lib/api";
import { PdfError, renderPrintPdf } from "@/lib/invoice-pdf";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * PDF daftar Email Reminder hari ini (semua kategori, atau satu kategori dengan `?type=`), dari halaman /print/reminders.
 * Hak akses mengikuti halaman cetak (menu Email Reminder, lihat).
 */
export async function GET(req: Request) {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) return Response.json({ message: "Belum login." }, { status: 401 });
  const raw = new URL(req.url).searchParams.get("type");
  const type = raw && (REMINDER_TYPES as readonly string[]).includes(raw) ? raw : null;
  try {
    const bytes = await renderPrintPdf(`/print/reminders${type ? `?type=${type}` : ""}`, token, ".reminder-print .page");
    const name = `Reminder-${todayStr()}${type ? `-${type}` : ""}.pdf`;
    return new Response(Buffer.from(bytes), {
      headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store", "Content-Disposition": `inline; filename="${name}"` },
    });
  } catch (e) {
    const status = e instanceof PdfError ? e.status : 500;
    const message = e instanceof Error ? e.message : "Gagal membuat PDF.";
    return new Response(`<!doctype html><meta charset="utf-8"><title>PDF gagal</title><body style="font-family:sans-serif;padding:24px"><h3>PDF gagal dibuat</h3><p>${message.replace(/</g, "&lt;")}</p></body>`,
      { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}
