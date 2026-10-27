import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { masterEntity, type MasterEntity, type MasterOptions } from "@sml/shared";
import { Forbidden, PageHeader } from "@/components/page-header";
import { apiFetch, ApiError } from "@/lib/api";
import { getAccess } from "@/lib/session";
import { MasterForm } from "../master-form";

export async function generateMetadata({ params }: PageProps<"/master/[entity]/[id]">): Promise<Metadata> {
  return { title: masterEntity((await params).entity)?.title ?? "Master Data" };
}

/** Nilai awal form dari baris API (angka/relasi → string, null → ''). */
function toInitial(entity: MasterEntity, row: Record<string, unknown> | null) {
  return Object.fromEntries(entity.fields.map((f) => {
    const v = row?.[f.name];
    if (f.type === "checkbox") return [f.name, row ? Boolean(v) : true];
    if (v === null || v === undefined) return [f.name, f.type === "select" && !row ? f.options?.[0] ?? "" : ""];
    return [f.name, String(v)];
  }));
}

export default async function MasterFormPage({ params }: PageProps<"/master/[entity]/[id]">) {
  const { entity: slug, id } = await params;
  const entity = masterEntity(slug);
  if (!entity) notFound();
  const isNew = id === "new";
  const { view, edit } = await getAccess(entity.slug);
  if (!view || (isNew && !edit)) return <><PageHeader title={entity.title} /><Forbidden /></>;
  if (!isNew && !/^\d+$/.test(id)) notFound();
  const [row, options] = await Promise.all([
    isNew ? null : apiFetch<Record<string, unknown>>(`/master/${slug}/${id}`).catch((e) => { if (e instanceof ApiError && e.status === 404) notFound(); throw e; }),
    apiFetch<MasterOptions>("/master/options"),
  ]);
  return (
    <div>
      <PageHeader title={`${entity.title} — ${isNew ? "Insert" : edit ? "Update" : "View"}`} description={entity.help} />
      <MasterForm entity={entity} id={isNew ? undefined : Number(id)} initial={toInitial(entity, row)} options={options} canEdit={edit} />
    </div>
  );
}
