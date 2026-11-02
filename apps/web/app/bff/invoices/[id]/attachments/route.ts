import { forwardToApi } from "@/lib/bff";

/** Upload lampiran invoice (multipart, field "files"). Batas ukuran & status terkunci ditegakkan API. */
export async function POST(request: Request, { params }: RouteContext<"/bff/invoices/[id]/attachments">) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return Response.json({ message: "Invoice tidak ditemukan." }, { status: 404 });
  const incoming = await request.formData();
  const form = new FormData();
  for (const f of incoming.getAll("files")) if (f instanceof File && f.size > 0) form.append("files", f, f.name);
  return forwardToApi(`/invoices/${id}/attachments`, { method: "POST", body: form });
}
