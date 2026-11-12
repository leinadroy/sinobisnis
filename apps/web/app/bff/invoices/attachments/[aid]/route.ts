import { forwardToApi } from "@/lib/bff";

/** Buka (inline) atau unduh (?download=1) lampiran invoice. */
export async function GET(req: Request, { params }: RouteContext<"/bff/invoices/attachments/[aid]">) {
  const { aid } = await params;
  if (!/^\d+$/.test(aid)) return Response.json({ message: "Lampiran tidak ditemukan." }, { status: 404 });
  const download = new URL(req.url).searchParams.get("download") === "1" ? "?download=1" : "";
  return forwardToApi(`/invoices/attachments/${aid}/file${download}`);
}
