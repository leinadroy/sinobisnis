import type { Metadata } from "next";
import type { SystemConfigRow } from "@sml/shared";
import { Forbidden, PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api";
import { getAccess } from "@/lib/session";
import { SystemConfigEditor } from "./system-config-editor";

export const metadata: Metadata = { title: "System Configurator" };

export default async function SystemConfigPage() {
  const { view, edit } = await getAccess("system-config");
  if (!view) return <><PageHeader title="System Configurator" /><Forbidden /></>;
  const rows = await apiFetch<SystemConfigRow[]>("/system-config");
  return (
    <div>
      <PageHeader title="System Configurator" description="Pengaturan aplikasi: SMTP email, jadwal reminder, dan nilai default invoice. Perubahan REMINDER_* langsung memuat ulang jadwal." />
      <SystemConfigEditor rows={rows} canEdit={edit} />
    </div>
  );
}
