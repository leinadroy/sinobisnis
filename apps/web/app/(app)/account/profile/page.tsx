import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { getMe } from "@/lib/session";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Edit Profile" };

export default async function ProfilePage() {
  const { user } = await getMe();
  return (
    <div>
      <PageHeader title="Edit Profile" />
      <ProfileForm username={user.username} roleName={user.roleName ?? "-"} fullname={user.fullname} email={user.email ?? ""} />
    </div>
  );
}
