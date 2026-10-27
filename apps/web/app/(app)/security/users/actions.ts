"use server";

import { revalidatePath } from "next/cache";
import type { UserRow } from "@sml/shared";
import { apiFetch, runAction } from "@/lib/api";
import { userSchema, type UserValues } from "./schema";

// Validasi diulang di server (Server Action bisa dipanggil langsung); otorisasi tetap di API (menu "users").
function toBody(v: UserValues) {
  return {
    fullname: v.fullname, username: v.username, email: v.email || null,
    roleId: Number(v.roleId), isActive: v.isActive, ...(v.password ? { password: v.password } : {}),
  };
}

export async function createUser(values: UserValues) {
  const parsed = userSchema(true).safeParse(values);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const res = await runAction(() => apiFetch<UserRow>("/users", { method: "POST", json: toBody(parsed.data) }));
  if (res.ok) revalidatePath("/security/users");
  return res;
}

export async function updateUser(id: number, values: UserValues) {
  const parsed = userSchema(false).safeParse(values);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const res = await runAction(() => apiFetch<UserRow>(`/users/${id}`, { method: "PATCH", json: toBody(parsed.data) }));
  if (res.ok) revalidatePath("/security/users");
  return res;
}

export async function deleteUser(id: number) {
  const res = await runAction(() => apiFetch(`/users/${id}`, { method: "DELETE" }));
  if (res.ok) revalidatePath("/security/users");
  return res;
}
