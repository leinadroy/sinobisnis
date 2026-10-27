import type { Metadata } from "next";
import Link from "next/link";
import { MATRIX_ITEMS, type RoleAccessResponse } from "@sml/shared";
import { Forbidden, PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api";
import { getAccess } from "@/lib/session";
import { cn } from "@/lib/utils";
import { AccessMatrix } from "./access-matrix";

export const metadata: Metadata = { title: "Hak Akses Role" };

export default async function RoleAccessPage({ searchParams }: PageProps<"/security/role-access">) {
  const { view, edit } = await getAccess("role-access");
  if (!view) return <><PageHeader title="Hak Akses Role" /><Forbidden /></>;
  const roles = await apiFetch<{ id: number; name: string }[]>("/roles/options");
  const sp = await searchParams;
  const selected = roles.find((r) => String(r.id) === sp.role) ?? roles[0];
  const data = selected ? await apiFetch<RoleAccessResponse>(`/role-access/${selected.id}`) : null;

  return (
    <div>
      <PageHeader
        title="Hak Akses Role"
        description="Centang menu yang boleh dilihat dan diubah (Insert/Update/Delete/Save) oleh tiap role. Home, Profile, Password, dan Logout selalu tersedia."
      />
      <div className="mb-4 flex gap-1 overflow-x-auto border-b">
        {roles.map((r) => (
          <Link key={r.id} href={`?role=${r.id}`}
            className={cn("whitespace-nowrap rounded-t-md px-4 py-2 text-sm text-muted-foreground hover:bg-muted",
              r.id === selected?.id && "bg-primary text-primary-foreground hover:bg-primary")}>
            {r.name}
          </Link>
        ))}
      </div>
      {data ? (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            {data.userCount} user memakai role <b>{data.role.name}</b>.
            {data.isSuperRole && " Role ini selalu punya akses penuh (supaya pengaturan tidak bisa terkunci), apa pun isi matriksnya."}
          </p>
          <AccessMatrix key={data.role.id} roleId={data.role.id} items={MATRIX_ITEMS} initial={data.access} canEdit={edit} isSuperRole={data.isSuperRole} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Belum ada role.</p>
      )}
    </div>
  );
}
