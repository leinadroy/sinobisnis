"use server";

import { revalidatePath } from "next/cache";
import type { KontrakDetail, KontrakInput } from "@sml/shared";
import { apiFetch, runAction } from "@/lib/api";

export async function saveKontrak(id: number | null, input: KontrakInput) {
  if (!input.billToId) return { ok: false as const, error: "Bill To wajib dipilih." };
  const res = await runAction(() =>
    id
      ? apiFetch<KontrakDetail>(`/kontrak/${id}`, { method: "PUT", json: input })
      : apiFetch<KontrakDetail>("/kontrak", { method: "POST", json: input }),
  );
  if (res.ok) {
    revalidatePath("/kontrak");
    if (id) revalidatePath(`/kontrak/${id}`);
  }
  return res;
}

export async function deleteKontrak(id: number) {
  const res = await runAction(() => apiFetch(`/kontrak/${id}`, { method: "DELETE" }));
  if (res.ok) revalidatePath("/kontrak");
  return res;
}
