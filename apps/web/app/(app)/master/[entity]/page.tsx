import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { masterEntity, type Paginated } from "@sml/shared";
import { Forbidden, PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api";
import { listQuery } from "@/lib/list-params";
import { getAccess } from "@/lib/session";
import { MasterTable } from "./master-table";

export async function generateMetadata({ params }: PageProps<"/master/[entity]">): Promise<Metadata> {
  return { title: masterEntity((await params).entity)?.title ?? "Master Data" };
}

export default async function MasterListPage({ params, searchParams }: PageProps<"/master/[entity]">) {
  const entity = masterEntity((await params).entity);
  if (!entity) notFound();
  const { view, edit } = await getAccess(entity.slug);
  if (!view) return <><PageHeader title={entity.title} /><Forbidden /></>;
  const { qs } = listQuery(await searchParams);
  const list = await apiFetch<Paginated<Record<string, unknown> & { id: number }>>(`/master/${entity.slug}?${qs}`);
  return (
    <div>
      <PageHeader title={entity.title} description={entity.help} />
      <Suspense>
        <MasterTable entity={entity} list={list} canEdit={edit} />
      </Suspense>
    </div>
  );
}
