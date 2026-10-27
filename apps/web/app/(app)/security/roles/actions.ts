"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, runAction } from "@/lib/api";

const clean = (name: string) => name.trim();

export async function saveRole(id: number | null, name: string) {
  if (!clean(name)) return { ok: false as const, error: "Nama role wajib diisi." };
  const res = await runAction(() =>
    id ? apiFetch(`/roles/${id}`, { method: "PATCH", json: { name: clean(name) } }) : apiFetch("/roles", { method: "POST", json: { name: clean(name) } }),
  );
  if (res.ok) revalidatePath("/security/roles");
  return res;
}

export async function deleteRole(id: number) {
  const res = await runAction(() => apiFetch(`/roles/${id}`, { method: "DELETE" }));
  if (res.ok) revalidatePath("/security/roles");
  return res;
}
