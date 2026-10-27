"use server";

import { revalidatePath } from "next/cache";
import { masterEntity } from "@sml/shared";
import { apiFetch, runAction } from "@/lib/api";

type FormValues = Record<string, string | boolean>;

/** Nilai form (string) → JSON sesuai tipe field; '' → null untuk field opsional. */
function toBody(slug: string, values: FormValues) {
  const entity = masterEntity(slug);
  if (!entity) throw new Error("Master data tidak dikenal.");
  const body: Record<string, unknown> = {};
  for (const f of entity.fields) {
    const v = values[f.name];
    if (f.type === "checkbox") body[f.name] = Boolean(v);
    else if (f.type === "number") body[f.name] = v === "" || v === undefined ? null : Number(v);
    else if (f.type === "ref") body[f.name] = v ? Number(v) : null;
    else body[f.name] = typeof v === "string" ? v : "";
  }
  // Angka wajib/berdefault (mis. periode, lastNo) tidak boleh null; kirim hanya bila diisi.
  for (const k of Object.keys(body)) if (body[k] === null && entity.fields.find((f) => f.name === k)?.type === "number" && !k.startsWith("reminder")) delete body[k];
  return body;
}

export async function saveMaster(slug: string, id: number | null, values: FormValues) {
  const body = toBody(slug, values);
  const res = await runAction(() =>
    id ? apiFetch(`/master/${slug}/${id}`, { method: "PATCH", json: body }) : apiFetch(`/master/${slug}`, { method: "POST", json: body }),
  );
  if (res.ok) revalidatePath(`/master/${slug}`);
  return res;
}

export async function deleteMaster(slug: string, id: number) {
  const res = await runAction(() => apiFetch(`/master/${slug}/${id}`, { method: "DELETE" }));
  if (res.ok) revalidatePath(`/master/${slug}`);
  return res;
}
