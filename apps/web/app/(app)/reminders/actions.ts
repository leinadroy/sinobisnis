"use server";

import { revalidatePath } from "next/cache";
import type { ReminderRunResult, ReminderSchedule } from "@sml/shared";
import { apiFetch, runAction } from "@/lib/api";

export async function runReminders(force: boolean) {
  const res = await runAction(() => apiFetch<ReminderRunResult[]>("/reminders/run", { method: "POST", json: { force } }));
  if (res.ok) revalidatePath("/reminders");
  return res;
}

export async function reloadSchedule() {
  const res = await runAction(() => apiFetch<ReminderSchedule>("/reminders/reload-schedule", { method: "POST" }));
  if (res.ok) revalidatePath("/reminders");
  return res;
}
