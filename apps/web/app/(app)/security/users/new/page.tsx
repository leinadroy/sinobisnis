import type { Metadata } from "next";
import { Forbidden, PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api";
import { getAccess } from "@/lib/session";
import { UserForm } from "../user-form";

export const metadata: Metadata = { title: "User Baru" };

export default async function NewUserPage() {
  const { edit } = await getAccess("users");
  if (!edit) return <><PageHeader title="User Baru" /><Forbidden /></>;
  const roles = await apiFetch<{ id: number; name: string }[]>("/roles/options");
  return (
    <div>
      <PageHeader title="User — Insert" />
      <UserForm
        roles={roles}
        canEdit
        initial={{ fullname: "", username: "", email: "", roleId: "", isActive: true, password: "", retypePassword: "" }}
      />
    </div>
  );
}
