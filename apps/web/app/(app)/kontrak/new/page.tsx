import type { Metadata } from "next";
import { todayStr, type MasterOptions } from "@sml/shared";
import { Forbidden, PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api";
import { getAccess } from "@/lib/session";
import { KontrakForm } from "../kontrak-form";

export const metadata: Metadata = { title: "Kontrak — Insert" };

export default async function NewKontrakPage() {
  const { edit } = await getAccess("kontrak");
  if (!edit) return <><PageHeader title="Kontrak — Insert" /><Forbidden /></>;
  const options = await apiFetch<MasterOptions>("/master/options");
  return (
    <div>
      <PageHeader title="Kontrak — Insert" />
      <KontrakForm options={options} canEdit initial={{ date: todayStr(), billToId: 0, alamat: null, isi: null, items: [] }} />
    </div>
  );
}
