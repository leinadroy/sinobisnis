import type { Metadata } from "next";
import { Suspense } from "react";
import { canView, type Paginated, type RoleRow } from "@sml/shared";
import { Forbidden, PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api";
import { listQuery } from "@/lib/list-params";
import { getAccess } from "@/lib/session";
import { RolesTable } from "./roles-table";

export const metadata: Metadata = { title: "Role" };

export default async function RolesPage({ searchParams }: PageProps<"/security/roles">) {
  const { me, view, edit } = await getAccess("roles");
  if (!view) return <><PageHeader title="Role" /><Forbidden /></>;
  const { qs } = listQuery(await searchParams);
  const list = await apiFetch<Paginated<RoleRow>>(`/roles?${qs}`);
  return (
    <div>
      <PageHeader title="Role" description="Kelompok hak akses user. Menu yang boleh dilihat/diubah diatur di Hak Akses Role." />
      <Suspense>
        <RolesTable list={list} canEdit={edit} canAccess={canView(me.access, "role-access")} />
      </Suspense>
    </div>
  );
}
