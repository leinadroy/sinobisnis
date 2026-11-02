import { forwardToApi } from "@/lib/bff";

/** Unduh lampiran invoice. */
export async function GET(_: Request, { params }: RouteContext<"/bff/invoices/attachments/[aid]">) {
  const { aid } = await params;
  if (!/^\d+$/.test(aid)) return Response.json({ message: "Lampiran tidak ditemukan." }, { status: 404 });
  return forwardToApi(`/invoices/attachments/${aid}/file`);
}
