import { forwardToApi } from "@/lib/bff";

/** Upload lampiran client (multipart, field "files"). Batas ukuran per file ditegakkan API (20 MB). */
export async function POST(request: Request, { params }: RouteContext<"/bff/clients/[id]/attachments">) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return Response.json({ message: "Client tidak ditemukan." }, { status: 404 });
  const incoming = await request.formData();
  const form = new FormData();
  for (const f of incoming.getAll("files")) if (f instanceof File && f.size > 0) form.append("files", f, f.name);
  return forwardToApi(`/clients/${id}/attachments`, { method: "POST", body: form });
}
