"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, Filter, Lock, Pencil, Plus, Printer } from "lucide-react";
import { INVOICE_STATUSES, type InvoiceList, type InvoiceRow, type MasterOptions } from "@sml/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/ui/search-select";
import { DataTable } from "@/components/data-table/data-table";
import { RecordCard } from "@/components/data-table/record-card";
import { SortHeader } from "@/components/data-table/column-header";
import { fmtDate, fmtMoney } from "@/lib/format";
import { INVOICE_FILTER_KEYS, type InvoiceFilterKey } from "./filters";
import { InvoiceStatusBadge, RequestStatusBadge } from "./status-badge";

type FilterKey = InvoiceFilterKey;


const columns: ColumnDef<InvoiceRow, unknown>[] = [
  { id: "id", accessorKey: "id", meta: { label: "ID" }, enableHiding: false, header: ({ column }) => <SortHeader column={column} title="ID" />,
    cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.id}</span> },
  {
    id: "actions", header: "", enableHiding: false, enableSorting: false,
    cell: ({ row }) => (
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon-xs" aria-label="Buka" nativeButton={false} render={<Link href={`/invoices/${row.original.id}`} />}><Pencil /></Button>
        <Button variant="ghost" size="icon-xs" aria-label="Print" nativeButton={false} render={<a href={`/print/invoices/${row.original.id}`} target="_blank" rel="noopener" />}><Printer /></Button>
      </div>
    ),
  },
  { id: "no", accessorKey: "no", meta: { label: "No" }, enableHiding: false, header: ({ column }) => <SortHeader column={column} title="No" />,
    cell: ({ row }) => <Link href={`/invoices/${row.original.id}`} className="whitespace-nowrap font-medium text-primary hover:underline">{row.original.no || `#${row.original.id}`}</Link> },
  { id: "date", accessorKey: "date", meta: { label: "Date" }, header: ({ column }) => <SortHeader column={column} title="Date" />, cell: ({ row }) => <span className="whitespace-nowrap">{fmtDate(row.original.date)}</span> },
  { id: "companyName", accessorKey: "companyName", meta: { label: "Company" }, header: ({ column }) => <SortHeader column={column} title="Company" /> },
  { id: "sponsorName", accessorKey: "sponsorName", meta: { label: "Sponsor" }, header: ({ column }) => <SortHeader column={column} title="Sponsor" /> },
  { id: "billToName", accessorKey: "billToName", meta: { label: "Billed To" }, header: ({ column }) => <SortHeader column={column} title="Billed To" /> },
  { id: "npwp", accessorKey: "npwp", meta: { label: "NPWP" }, header: "NPWP", enableSorting: false },
  { id: "clientCount", accessorKey: "clientCount", meta: { label: "Client" }, header: "Client", enableSorting: false, cell: ({ row }) => <span className="tabular-nums">{row.original.clientCount}</span> },
  { id: "status", accessorKey: "status", meta: { label: "Status" }, header: ({ column }) => <SortHeader column={column} title="Status" />,
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1">
        <InvoiceStatusBadge status={row.original.status} />
        {row.original.status !== "DRAFT" && row.original.requestStatus !== "APPROVED" && <Lock className="size-3 text-muted-foreground" aria-label="Terkunci" />}
      </span>
    ) },
  { id: "requestStatus", accessorKey: "requestStatus", meta: { label: "Request" }, header: "Request", enableSorting: false,
    cell: ({ row }) => (row.original.requestStatus ? <RequestStatusBadge status={row.original.requestStatus} /> : null) },
  { id: "paidDate", accessorKey: "paidDate", meta: { label: "Paid Date" }, header: ({ column }) => <SortHeader column={column} title="Paid Date" />, cell: ({ row }) => <span className="whitespace-nowrap">{fmtDate(row.original.paidDate)}</span> },
  { id: "subTotal", accessorKey: "subTotal", meta: { label: "Sub Total" }, header: ({ column }) => <SortHeader column={column} title="Sub Total" />, cell: ({ row }) => <span className="block text-right tabular-nums">{fmtMoney(row.original.subTotal)}</span> },
  { id: "total", accessorKey: "total", meta: { label: "Total" }, header: ({ column }) => <SortHeader column={column} title="Total" />, cell: ({ row }) => <span className="block text-right font-medium tabular-nums">{fmtMoney(row.original.total)}</span> },
  { id: "information", accessorKey: "information", meta: { label: "Information" }, header: "Information", enableSorting: false,
    cell: ({ row }) => <span className="line-clamp-2 min-w-48 whitespace-normal">{row.original.information}</span> },
  { id: "bankAccountLabel", accessorKey: "bankAccountLabel", meta: { label: "Bank Account" }, header: "Bank Account", enableSorting: false },
  { id: "createdBy", accessorKey: "createdBy", meta: { label: "Dibuat oleh" }, header: "Dibuat oleh", enableSorting: false },
];

export function InvoicesTable({ list, options, canCreate }: { list: InvoiceList; options: MasterOptions; canCreate: boolean }) {
  const params = useSearchParams();
  const active = INVOICE_FILTER_KEYS.filter((k) => params.get(k)).length;
  const [toggled, setShowFilters] = useState<boolean | null>(null);
  const showFilters = toggled ?? active > 0;
  const exportQs = new URLSearchParams(params.toString());
  ["page", "pageSize"].forEach((k) => exportQs.delete(k));

  return (
    <div className="space-y-2">
      <DataTable
        columns={columns}
        data={list.data}
        total={list.total}
        page={list.page}
        pageSize={list.pageSize}
        hiddenColumns={["npwp", "information", "bankAccountLabel", "createdBy", "subTotal", "companyName"]}
        searchPlaceholder="Cari no invoice, sponsor, bill to, nama client…"
        filters={showFilters && <InvoiceFilters options={options} />}
        renderCard={(r) => (
          <RecordCard
            title={<Link href={`/invoices/${r.id}`} className="text-primary hover:underline">{r.no || `#${r.id}`}</Link>}
            fields={[
              ["ID", String(r.id)],
              ["Status", <span key="s" className="inline-flex gap-1"><InvoiceStatusBadge status={r.status} />{r.requestStatus && <RequestStatusBadge status={r.requestStatus} />}</span>],
              ["Date", fmtDate(r.date)],
              ["Billed To", r.billToName],
              ["Sponsor", r.sponsorName],
              ["Total", <span key="t" className="font-medium tabular-nums">Rp {fmtMoney(r.total)}</span>],
              ["Paid Date", fmtDate(r.paidDate)],
            ]}
            actions={<Button variant="ghost" size="icon-sm" aria-label="Print" nativeButton={false} render={<a href={`/print/invoices/${r.id}`} target="_blank" rel="noopener" />}><Printer /></Button>}
          />
        )}
        toolbar={
          <>
            {canCreate && <Button nativeButton={false} render={<Link href="/invoices/create" />}><Plus /> Create Invoice</Button>}
            <Button variant="outline" nativeButton={false} render={<a href={`/bff/invoices/export?${exportQs.toString()}`} />}><Download /> Export</Button>
            <Button variant={showFilters ? "secondary" : "outline"} onClick={() => setShowFilters(!showFilters)}>
              <Filter /> Filter{active > 0 && ` (${active})`}
            </Button>
          </>
        }
      />
      <p className="text-right text-sm text-muted-foreground">
        Jumlah nominal (sesuai filter): <b className="tabular-nums text-foreground">Rp {fmtMoney(list.amount)}</b>
      </p>
    </div>
  );
}

function InvoiceFilters({ options }: { options: MasterOptions }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [v, setV] = useState<Record<FilterKey, string>>(() => Object.fromEntries(INVOICE_FILTER_KEYS.map((k) => [k, params.get(k) ?? ""])) as Record<FilterKey, string>);
  const set = (k: FilterKey, val: string) => setV((s) => ({ ...s, [k]: val }));
  const apply = (values: Record<FilterKey, string>) => {
    const next = new URLSearchParams(params.toString());
    INVOICE_FILTER_KEYS.forEach((k) => (values[k] ? next.set(k, values[k]) : next.delete(k)));
    next.set("page", "1");
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  const clear = () => {
    const empty = Object.fromEntries(INVOICE_FILTER_KEYS.map((k) => [k, ""])) as Record<FilterKey, string>;
    setV(empty);
    apply(empty);
  };
  const select = (k: FilterKey, label: string, items: { value: string; label: string }[]) => (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <SearchSelect items={items} value={v[k]} onValueChange={(x) => set(k, x ?? "")} className="w-full" />
    </div>
  );
  return (
    <form onSubmit={(e) => { e.preventDefault(); apply(v); }} className="grid grid-cols-1 gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-5">
      {select("status", "Status", [{ value: "", label: "Semua status" }, ...INVOICE_STATUSES.map((s) => ({ value: s, label: s }))])}
      {select("sponsorId", "Sponsor", [{ value: "", label: "Semua sponsor" }, ...options.sponsors.map((s) => ({ value: String(s.id), label: s.name }))])}
      {select("billToId", "Bill To", [{ value: "", label: "Semua bill to" }, ...options.billTos.map((b) => ({ value: String(b.id), label: b.label }))])}
      <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-2">
        <div className="space-y-1">
          <Label htmlFor="f-from" className="text-xs text-muted-foreground">Invoice date dari</Label>
          <Input id="f-from" type="date" value={v.from} onChange={(e) => set("from", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-to" className="text-xs text-muted-foreground">sampai</Label>
          <Input id="f-to" type="date" value={v.to} onChange={(e) => set("to", e.target.value)} />
        </div>
      </div>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5 lg:justify-end">
        <Button type="submit" disabled={pending}>Apply</Button>
        <Button type="button" variant="outline" onClick={clear} disabled={pending}>Clear</Button>
      </div>
    </form>
  );
}
