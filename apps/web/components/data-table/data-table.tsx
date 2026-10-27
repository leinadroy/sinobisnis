"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  flexRender, getCoreRowModel, useReactTable,
  type Column, type ColumnDef, type SortingState, type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Columns3, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  /** Tombol tambahan di toolbar (mis. Insert). */
  toolbar?: React.ReactNode;
  /** Panel filter tambahan di bawah toolbar. */
  filters?: React.ReactNode;
  searchPlaceholder?: string;
  /** Kelas CSS per baris (mis. warna status expired). */
  rowClassName?: (row: T) => string | undefined;
  /** Kolom yang disembunyikan secara default (bisa ditampilkan lewat menu Kolom). */
  hiddenColumns?: string[];
  /** Tampilan kartu per baris untuk layar HP (< md); bila diisi, tabel hanya tampil di layar lebar. */
  renderCard?: (row: T) => React.ReactNode;
}

/**
 * DataTable generik: sorting, search, dan pagination dijalankan di server (API NestJS),
 * state-nya disimpan di URL (?page, pageSize, sort, order, search) agar bisa dibagikan & di-refresh.
 */
export function DataTable<T>({ columns, data, total, page, pageSize, toolbar, filters, searchPlaceholder = "Cari…", rowClassName, hiddenColumns = [], renderCard }: DataTableProps<T>) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [visibility, setVisibility] = useState<VisibilityState>(() => Object.fromEntries(hiddenColumns.map((c) => [c, false])));

  const sorting: SortingState = params.get("sort") ? [{ id: params.get("sort")!, desc: params.get("order") === "desc" }] : [];
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const update = (patch: Record<string, string | number | null>) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(patch).forEach(([k, v]) => (v === null || v === "" ? next.delete(k) : next.set(k, String(v))));
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  // Search dengan jeda supaya tidak memanggil API di setiap ketikan.
  useEffect(() => {
    if (search === (params.get("search") ?? "")) return;
    const t = setTimeout(() => update({ search: search.trim(), page: 1 }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    pageCount,
    state: { sorting, columnVisibility: visibility },
    onColumnVisibilityChange: setVisibility,
    onSortingChange: (updater) => {
      const s = typeof updater === "function" ? updater(sorting) : updater;
      update({ sort: s[0]?.id ?? null, order: s[0] ? (s[0].desc ? "desc" : "asc") : null, page: 1 });
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {toolbar}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={searchPlaceholder} className="pl-8" aria-label="Cari" />
        </div>
        <DropdownMenu>
          {/* Pilihan kolom hanya relevan untuk tampilan tabel. */}
          <DropdownMenuTrigger render={<Button variant="outline" className={renderCard ? "hidden md:inline-flex" : undefined} />}>
            <Columns3 /> Kolom
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table.getAllLeafColumns().filter((c) => c.getCanHide()).map((c) => (
              <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(!!v)}>
                {typeof c.columnDef.header === "string" ? c.columnDef.header : (c.columnDef.meta as { label?: string })?.label ?? c.id}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {filters}

      {renderCard && (
        <div className={`space-y-2 md:hidden transition-opacity ${pending ? "opacity-60" : ""}`}>
          <MobileSort columns={table.getAllLeafColumns().filter((c) => c.getCanSort())} sort={sorting[0]} onChange={(id, desc) => update({ sort: id, order: id ? (desc ? "desc" : "asc") : null, page: 1 })} />
          {data.length ? data.map((row, i) => <div key={i}>{renderCard(row)}</div>) : (
            <p className="rounded-lg border py-8 text-center text-sm text-muted-foreground">Tidak ada data.</p>
          )}
        </div>
      )}

      <div className={`overflow-x-auto rounded-lg border transition-opacity ${pending ? "opacity-60" : ""} ${renderCard ? "hidden md:block" : ""}`}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className="whitespace-nowrap">
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className={rowClassName?.(row.original)}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={table.getVisibleLeafColumns().length} className="h-20 text-center text-muted-foreground">
                  Tidak ada data.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">Total {total} data</span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Halaman pertama" disabled={page <= 1} onClick={() => update({ page: 1 })}><ChevronsLeft /></Button>
          <Button variant="outline" size="icon-sm" aria-label="Halaman sebelumnya" disabled={page <= 1} onClick={() => update({ page: page - 1 })}><ChevronLeft /></Button>
          <span className="px-2">Page {page} of {pageCount}</span>
          <Button variant="outline" size="icon-sm" aria-label="Halaman berikutnya" disabled={page >= pageCount} onClick={() => update({ page: page + 1 })}><ChevronRight /></Button>
          <Button variant="outline" size="icon-sm" aria-label="Halaman terakhir" disabled={page >= pageCount} onClick={() => update({ page: pageCount })}><ChevronsRight /></Button>
        </div>
      </div>
    </div>
  );
}

/** Pilihan urutan untuk tampilan kartu (header kolom tidak terlihat di HP). */
function MobileSort<T>({ columns, sort, onChange }: {
  columns: Column<T, unknown>[];
  sort?: { id: string; desc: boolean };
  onChange: (id: string | null, desc: boolean) => void;
}) {
  if (!columns.length) return null;
  const label = (c: Column<T, unknown>) => (c.columnDef.meta as { label?: string } | undefined)?.label ?? c.id;
  const items = [{ value: "", label: "Urutan default" }, ...columns.map((c) => ({ value: c.id, label: label(c) }))];
  return (
    <div className="flex items-center gap-2">
      <Select items={items} value={sort?.id ?? ""} onValueChange={(v) => onChange(v || null, sort?.desc ?? false)}>
        <SelectTrigger className="flex-1" aria-label="Urutkan"><SelectValue /></SelectTrigger>
        <SelectContent>{items.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
      </Select>
      <Button variant="outline" size="icon" disabled={!sort} aria-label={sort?.desc ? "Urut naik" : "Urut turun"}
        onClick={() => sort && onChange(sort.id, !sort.desc)}>
        {sort?.desc ? <ArrowDown /> : <ArrowUp />}
      </Button>
    </div>
  );
}
