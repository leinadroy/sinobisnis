import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { UserRow } from "@sml/shared";
import { Forbidden, PageHeader } from "@/components/page-header";
import { apiFetch, ApiError } from "@/lib/api";
import { getAccess } from "@/lib/session";
import { UserForm } from "../user-form";

export const metadata: Metadata = { title: "User" };

export default async function EditUserPage({ params }: PageProps<"/security/users/[id]">) {
  const { view, edit } = await getAccess("users");
  if (!view) return <><PageHeader title="User" /><Forbidden /></>;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [user, roles] = await Promise.all([
    apiFetch<UserRow>(`/users/${id}`).catch((e) => { if (e instanceof ApiError && e.status === 404) notFound(); throw e; }),
    apiFetch<{ id: number; name: string }[]>("/roles/options"),
  ]);
  return (
    <div>
      <PageHeader title={`User — ${edit ? "Update" : "View"}`} description={user.username} />
      <UserForm
        id={user.id}
        roles={roles}
        canEdit={edit}
        initial={{
          fullname: user.fullname, username: user.username, email: user.email ?? "",
          roleId: user.roleId ? String(user.roleId) : "", isActive: user.isActive, password: "", retypePassword: "",
        }}
      />
    </div>
  );
}
