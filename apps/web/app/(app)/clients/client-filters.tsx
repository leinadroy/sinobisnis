"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MasterOptions } from "@sml/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/ui/search-select";

const KEYS = ["sponsorId", "keperluanId", "from", "to", "expiring", "uninvoiced", "unpaid"] as const;
type Key = (typeof KEYS)[number];

/** Panel filter list client; nilainya disimpan di URL agar bisa dibagikan & di-export dengan filter yang sama. */
export function ClientFilters({ options }: { options: MasterOptions }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [v, setV] = useState<Record<Key, string>>(() => Object.fromEntries(KEYS.map((k) => [k, params.get(k) ?? ""])) as Record<Key, string>);
  const set = (k: Key, val: string) => setV((s) => ({ ...s, [k]: val }));

  const apply = (values: Record<Key, string>) => {
    const next = new URLSearchParams(params.toString());
    KEYS.forEach((k) => (values[k] ? next.set(k, values[k]) : next.delete(k)));
    next.set("page", "1");
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  const clear = () => {
    const empty = Object.fromEntries(KEYS.map((k) => [k, ""])) as Record<Key, string>;
    setV(empty);
    apply(empty);
  };

  const sponsorItems = [{ value: "", label: "Semua sponsor" }, ...options.sponsors.map((s) => ({ value: String(s.id), label: s.name }))];
  const kepItems = [{ value: "", label: "Semua keperluan" }, ...options.keperluan.map((k) => ({ value: String(k.id), label: k.name }))];

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); apply(v); }}
      className="grid grid-cols-1 gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Sponsor</Label>
        <SearchSelect items={sponsorItems} value={v.sponsorId} onValueChange={(x) => set("sponsorId", x ?? "")} className="w-full" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Keperluan</Label>
        <SearchSelect items={kepItems} value={v.keperluanId} onValueChange={(x) => set("keperluanId", x ?? "")} className="w-full" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="f-from" className="text-xs text-muted-foreground">Permohonan dari</Label>
          <DateInput id="f-from" value={v.from} onChange={(d) => set("from", d)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-to" className="text-xs text-muted-foreground">sampai</Label>
          <DateInput id="f-to" value={v.to} onChange={(d) => set("to", d)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="f-exp" className="text-xs text-muted-foreground">Expired dalam (hari)</Label>
        <Input id="f-exp" type="number" min={0} placeholder="mis. 60" value={v.expiring} onChange={(e) => set("expiring", e.target.value)} />
      </div>
      <div className="flex flex-col justify-center gap-2 text-sm sm:col-span-2 lg:col-span-2">
        <label className="flex items-center gap-2"><Checkbox checked={v.uninvoiced === "1"} onCheckedChange={(c) => set("uninvoiced", c ? "1" : "")} /> Selesai diproses, belum invoice</label>
        <label className="flex items-center gap-2"><Checkbox checked={v.unpaid === "1"} onCheckedChange={(c) => set("unpaid", c ? "1" : "")} /> Invoice belum dibayar</label>
      </div>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2 lg:justify-end">
        <Button type="submit" disabled={pending}>Apply</Button>
        <Button type="button" variant="outline" onClick={clear} disabled={pending}>Clear</Button>
      </div>
    </form>
  );
}
