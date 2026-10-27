import "server-only";
import { cookies } from "next/headers";
import { API_URL, TOKEN_COOKIE } from "./api";

/**
 * Teruskan request file (upload/download/export) ke API dengan token dari cookie httpOnly.
 * Response API (status, header file, body stream) dikembalikan apa adanya.
 */
export async function forwardToApi(path: string, init: RequestInit = {}): Promise<Response> {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) return Response.json({ message: "Belum login." }, { status: 401 });
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (!res) return Response.json({ message: "API tidak dapat dihubungi." }, { status: 503 });
  const headers = new Headers();
  for (const h of ["content-type", "content-disposition", "content-length"]) {
    const v = res.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(res.body, { status: res.status, headers });
}
