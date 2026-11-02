"use server";

import { revalidatePath } from "next/cache";
import type { SystemConfigRow } from "@sml/shared";
import { apiFetch, runAction } from "@/lib/api";

const refresh = () => {
  revalidatePath("/developer/system-config");
  revalidatePath("/reminders");
};

export async function setConfig(key: string, value: string) {
  const res = await runAction(() => apiFetch<SystemConfigRow>(`/system-config/${encodeURIComponent(key)}`, { method: "PUT", json: { value } }));
  if (res.ok) refresh();
  return res;
}

export async function createConfig(key: string, value: string) {
  const res = await runAction(() => apiFetch<SystemConfigRow>("/system-config", { method: "POST", json: { key: key.trim().toUpperCase(), value } }));
  if (res.ok) refresh();
  return res;
}

export async function deleteConfig(key: string) {
  const res = await runAction(() => apiFetch(`/system-config/${encodeURIComponent(key)}`, { method: "DELETE" }));
  if (res.ok) refresh();
  return res;
}

export async function sendTestEmail(to: string) {
  return runAction(() => apiFetch("/system-config/test-email", { method: "POST", json: { to } }));
}
