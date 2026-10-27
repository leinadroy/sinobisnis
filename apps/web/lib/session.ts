import "server-only";
import { cache } from "react";
import { canEdit, canView, type MeResponse } from "@sml/shared";
import { apiFetch } from "./api";

/** User + matriks hak akses; di-cache per request supaya layout & halaman tidak memanggil API dua kali. */
export const getMe = cache(() => apiFetch<MeResponse>("/auth/me"));

export async function getAccess(key: string) {
  const me = await getMe();
  return { me, view: canView(me.access, key), edit: canEdit(me.access, key) };
}
