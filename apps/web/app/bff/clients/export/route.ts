import { forwardToApi } from "@/lib/bff";

/** Export CSV client sesuai filter list (query string diteruskan ke API). */
export async function GET(request: Request) {
  const { search } = new URL(request.url);
  return forwardToApi(`/clients/export${search}`);
}
