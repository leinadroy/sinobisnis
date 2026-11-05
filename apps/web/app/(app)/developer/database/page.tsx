import type { Metadata } from "next";
import type { DbProfilesResponse } from "@sml/shared";
import { Forbidden, PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api";
import { getMe } from "@/lib/session";
import { DbProfiles } from "./db-profiles";

export const metadata: Metadata = { title: "Database" };

export default async function DatabasePage() {
  const me = await getMe();
  if (!me.isSuperRole) return <><PageHeader title="Database" /><Forbidden /></>;
  const data = await apiFetch<DbProfilesResponse>("/database/profiles");
  return (
    <div>
      <PageHeader
        title="Database"
        description="Pilih database yang dipakai aplikasi. Alamat dan password tiap profil diatur di file .env server (DB_PROFILES, DB_URL_<PROFIL>), bukan dari halaman ini. Setelah pindah, semua user harus login ulang."
      />
      <DbProfiles data={data} />
    </div>
  );
}
