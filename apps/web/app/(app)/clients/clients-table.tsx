"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Download, Filter, Plus } from "lucide-react";
import type { ClientRow, MasterOptions, Paginated } from "@sml/shared";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table/data-table";
import { ClientCard } from "./client-card";
import { ClientFilters } from "./client-filters";
import { CLIENT_HIDDEN_COLUMNS, clientColumns, expiryClass } from "./columns";

const FILTER_KEYS = ["sponsorId", "keperluanId", "from", "to", "expiring", "uninvoiced", "unpaid"];

export function ClientsTable({ list, options, canEdit, archived = false }: {
  list: Paginated<ClientRow>; options: MasterOptions; canEdit: boolean; archived?: boolean;
}) {
  const params = useSearchParams();
  const active = FILTER_KEYS.filter((k) => params.get(k)).length;
  // null = belum disentuh user: panel terbuka otomatis bila ada filter aktif di URL.
  const [toggled, setShowFilters] = useState<boolean | null>(null);
  const showFilters = toggled ?? active > 0;

  // Export memakai filter & pencarian yang sama dengan list (tanpa paging).
  const exportQs = new URLSearchParams(params.toString());
  ["page", "pageSize"].forEach((k) => exportQs.delete(k));
  if (archived) exportQs.set("archived", "true");

  return (
    <div className="space-y-2">
      <DataTable
        columns={clientColumns(archived)}
        data={list.data}
        total={list.total}
        page={list.page}
        pageSize={list.pageSize}
        hiddenColumns={CLIENT_HIDDEN_COLUMNS}
        rowClassName={expiryClass}
        renderCard={(r) => <ClientCard row={r} archived={archived} />}
        searchPlaceholder="Filter Full Text (nama, paspor, RPTKA, invoice, sponsor…)"
        filters={showFilters && <ClientFilters options={options} />}
        toolbar={
          <>
            {canEdit && !archived && (
              <Button nativeButton={false} render={<Link href="/clients/new" />}><Plus /> Insert</Button>
            )}
            <Button variant="outline" nativeButton={false} render={<a href={`/bff/clients/export?${exportQs.toString()}`} />}>
              <Download /> Export
            </Button>
            <Button variant={showFilters ? "secondary" : "outline"} onClick={() => setShowFilters(!showFilters)}>
              <Filter /> Filter{active > 0 && ` (${active})`}
            </Button>
          </>
        }
      />
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm border border-red-200 bg-red-50" /> Sudah expired</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm border border-orange-200 bg-orange-50" /> Expired ≤ 30 hari</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm border border-yellow-200 bg-yellow-50" /> Expired ≤ 60 hari</span>
      </div>
    </div>
  );
}
