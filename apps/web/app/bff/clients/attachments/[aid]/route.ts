import { forwardToApi } from "@/lib/bff";

/** Unduh lampiran client. */
export async function GET(_: Request, { params }: RouteContext<"/bff/clients/attachments/[aid]">) {
  const { aid } = await params;
  if (!/^\d+$/.test(aid)) return Response.json({ message: "Lampiran tidak ditemukan." }, { status: 404 });
  return forwardToApi(`/clients/attachments/${aid}/file`);
}
