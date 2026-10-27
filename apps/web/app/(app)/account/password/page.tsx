import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Change Password" };

export default function ChangePasswordPage() {
  return (
    <div>
      <PageHeader title="Change Password" />
      <PasswordForm />
    </div>
  );
}
