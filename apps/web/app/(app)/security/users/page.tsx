import type { Metadata } from "next";
import { Suspense } from "react";
import type { Paginated, UserRow } from "@sml/shared";
import { Forbidden, PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api";
import { listQuery } from "@/lib/list-params";
import { getAccess } from "@/lib/session";
import { UsersTable } from "./users-table";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: PageProps<"/security/users">) {
  const { me, view, edit } = await getAccess("users");
  if (!view) return <><PageHeader title="Users" /><Forbidden /></>;
  const { qs } = listQuery(await searchParams);
  const list = await apiFetch<Paginated<UserRow>>(`/users?${qs}`);
  return (
    <div>
      <PageHeader title="Users" description="Akun yang bisa login ke aplikasi beserta role-nya." />
      <Suspense>
        <UsersTable list={list} canEdit={edit} meId={me.user.id} />
      </Suspense>
    </div>
  );
}
