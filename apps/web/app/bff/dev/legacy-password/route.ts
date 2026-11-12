import { forwardToApi } from "@/lib/bff";

/**
 * Tes Password GX. Sengaja lewat route handler, bukan server action: `next dev` mencatat argumen server action
 * (termasuk password) di terminal, sedangkan body route handler tidak dicatat.
 */
export async function POST(request: Request) {
  return forwardToApi("/auth/legacy-password/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
  });
}
