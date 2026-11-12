import type { Metadata } from "next";
import { Forbidden, PageHeader } from "@/components/page-header";
import { getMe } from "@/lib/session";
import { LegacyPasswordTester } from "./legacy-password-tester";

export const metadata: Metadata = { title: "Tes Password GX" };

export default async function LegacyPasswordPage() {
  const me = await getMe();
  if (!me.isSuperRole) return <><PageHeader title="Tes Password GX" /><Forbidden /></>;
  return (
    <div>
      <PageHeader
        title="Tes Password GX"
        description="Uji rumus hash password aplikasi GeneXus lama: SHA-256(password + SystemSalt + UsersSalt). User dibaca dari database login yang aktif; tidak ada yang diubah dan password tidak disimpan atau dicatat. Login aplikasi belum memakai rumus ini."
      />
      <LegacyPasswordTester />
    </div>
  );
}
