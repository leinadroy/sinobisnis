"use server";

import { revalidatePath } from "next/cache";
import type { AccessMap, RoleAccessResponse } from "@sml/shared";
import { apiFetch, runAction } from "@/lib/api";

export async function saveRoleAccess(roleId: number, access: AccessMap) {
  const res = await runAction(() => apiFetch<RoleAccessResponse>(`/role-access/${roleId}`, { method: "PUT", json: { access } }));
  // Sidebar user lain ikut berubah saat mereka memuat halaman berikutnya.
  if (res.ok) revalidatePath("/", "layout");
  return res;
}
