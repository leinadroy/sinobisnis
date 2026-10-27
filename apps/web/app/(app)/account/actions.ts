"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, runAction } from "@/lib/api";
import { passwordSchema, type PasswordValues } from "./schema";

export async function changePassword(values: PasswordValues) {
  const parsed = passwordSchema.safeParse(values);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  return runAction(() => apiFetch("/auth/change-password", { method: "POST", json: { current: parsed.data.current, password: parsed.data.password } }));
}

export async function updateProfile(values: { fullname: string; email: string }) {
  if (!values.fullname.trim()) return { ok: false as const, error: "Fullname wajib diisi." };
  const res = await runAction(() => apiFetch("/auth/profile", { method: "PATCH", json: { fullname: values.fullname.trim(), email: values.email.trim() || null } }));
  if (res.ok) revalidatePath("/", "layout");
  return res;
}
