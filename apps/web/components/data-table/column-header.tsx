"use client";

import type { Column } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Header kolom yang bisa diklik untuk sort (asc → desc → tanpa sort). */
export function SortHeader<T>({ column, title }: { column: Column<T, unknown>; title: string }) {
  const dir = column.getIsSorted();
  const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <Button variant="ghost" size="sm" className="-ml-2" onClick={() => column.toggleSorting(dir === "asc")}>
      {title} <Icon className={dir ? "" : "opacity-40"} />
    </Button>
  );
}
