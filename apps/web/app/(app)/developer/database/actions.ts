"use server";

import { cookies } from "next/headers";
import type { DbTestResult } from "@sml/shared";
import { apiFetch, runAction, TOKEN_COOKIE } from "@/lib/api";

export async function testProfile(key: string) {
  return runAction(() => apiFetch<DbTestResult>(`/database/profiles/${encodeURIComponent(key)}/test`, { method: "POST" }));
}

/** Pindah database. Bila berhasil, sesi login dihapus (token lama tidak berlaku di database baru). */
export async function switchProfile(key: string, confirm: string) {
  const res = await runAction(() => apiFetch<DbTestResult>("/database/switch", { method: "POST", json: { key, confirm: confirm || undefined } }));
  if (res.ok) (await cookies()).delete(TOKEN_COOKIE);
  return res;
}
