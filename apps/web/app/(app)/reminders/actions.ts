"use server";

import { revalidatePath } from "next/cache";
import type { ReminderRunResult, ReminderSchedule } from "@sml/shared";
import { apiFetch, runAction } from "@/lib/api";

/** `to`/`cc` terisi = kirim manual ke alamat tertentu (bukan Email Recipient). */
export async function runReminders(force: boolean, to?: string[], cc?: string[]) {
  const json = to?.length ? { force, to, cc: cc ?? [] } : { force };
  const res = await runAction(() => apiFetch<ReminderRunResult[]>("/reminders/run", { method: "POST", json }));
  if (res.ok) revalidatePath("/reminders");
  return res;
}

export async function reloadSchedule() {
  const res = await runAction(() => apiFetch<ReminderSchedule>("/reminders/reload-schedule", { method: "POST" }));
  if (res.ok) revalidatePath("/reminders");
  return res;
}
