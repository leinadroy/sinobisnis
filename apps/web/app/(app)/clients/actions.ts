"use server";

import { revalidatePath } from "next/cache";
import { CLIENT_DATE_FIELDS, CLIENT_TEXT_FIELDS, type ClientDetail, type ConversationRow } from "@sml/shared";
import { apiFetch, runAction } from "@/lib/api";
import { clientSchema, type ClientFormValues } from "./schema";

function toBody(v: ClientFormValues) {
  const body: Record<string, unknown> = {};
  for (const f of [...CLIENT_DATE_FIELDS, ...CLIENT_TEXT_FIELDS]) body[f] = v[f]?.trim() || null;
  body.name = v.name.trim();
  for (const f of ["sponsorId", "projectId", "keperluanId"] as const) body[f] = v[f] ? Number(v[f]) : null;
  body.isArchived = v.isArchived;
  return body;
}

const refresh = (id?: number) => {
  revalidatePath("/clients");
  revalidatePath("/clients/archived");
  if (id) revalidatePath(`/clients/${id}`);
};

export async function saveClient(id: number | null, values: ClientFormValues) {
  const parsed = clientSchema.safeParse(values);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const res = await runAction(() =>
    id
      ? apiFetch<ClientDetail>(`/clients/${id}`, { method: "PATCH", json: toBody(parsed.data) })
      : apiFetch<ClientDetail>("/clients", { method: "POST", json: toBody(parsed.data) }),
  );
  if (res.ok) refresh(res.data?.id);
  return res;
}

export async function deleteClient(id: number) {
  const res = await runAction(() => apiFetch(`/clients/${id}`, { method: "DELETE" }));
  if (res.ok) refresh();
  return res;
}

export async function addConversation(id: number, message: string) {
  if (!message.trim()) return { ok: false as const, error: "Pesan tidak boleh kosong." };
  const res = await runAction(() => apiFetch<ConversationRow>(`/clients/${id}/conversations`, { method: "POST", json: { message } }));
  if (res.ok) revalidatePath(`/clients/${id}`);
  return res;
}

export async function deleteAttachment(clientId: number, attachmentId: number) {
  const res = await runAction(() => apiFetch(`/clients/attachments/${attachmentId}`, { method: "DELETE" }));
  if (res.ok) revalidatePath(`/clients/${clientId}`);
  return res;
}
