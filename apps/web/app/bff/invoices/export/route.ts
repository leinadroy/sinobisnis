import { forwardToApi } from "@/lib/bff";

/** Export CSV invoice sesuai filter list (query string diteruskan ke API). */
export async function GET(request: Request) {
  const { search } = new URL(request.url);
  return forwardToApi(`/invoices/export${search}`);
}
