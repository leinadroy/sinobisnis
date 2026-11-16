"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { todayStr } from "@sml/shared";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/format";

export function ReminderDateFilter({ date }: { date: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = todayStr();
  const tomorrow = new Date(`${today}T00:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const next = todayStr(tomorrow);

  function choose(value: string) {
    const query = new URLSearchParams(searchParams.toString());
    if (value === today) query.delete("date");
    else query.set("date", value);
    router.push(`/reminders?${query.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
      <div className="mr-2 min-w-40">
        <p className="text-sm font-medium">Tanggal reminder</p>
        <p className="text-xs text-muted-foreground">Menampilkan calon reminder untuk {fmtDate(date)}.</p>
      </div>
      <Button size="sm" variant={date === today ? "default" : "outline"} onClick={() => choose(today)}>Hari ini</Button>
      <Button size="sm" variant={date === next ? "default" : "outline"} onClick={() => choose(next)}>Besok</Button>
      <label className="flex items-center gap-2 text-sm">
        <span>Tanggal lain</span>
        <input aria-label="Tanggal reminder lain" type="date" value={date} onChange={(e) => e.target.value && choose(e.target.value)} className="h-9 rounded-md border bg-background px-2" />
      </label>
      {date !== today && <p className="w-full text-xs text-muted-foreground">Tanggal pilihan hanya untuk melihat dan mencetak daftar. Pengiriman reminder manual tetap untuk hari ini.</p>}
    </div>
  );
}
