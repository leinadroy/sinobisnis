import type { ClientHistory } from "@sml/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle>Riwayat Perubahan</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Riwayat dari datalog — dimuat terpisah (di dalam <Suspense>) karena query datalog lambat (tanpa index). */
export async function HistoryCard({ clientId }: { clientId: number }) {
  const history = await apiFetch<ClientHistory>(`/clients/${clientId}/history`).catch(() => null);
  return (
    <Shell>
      {!history ? (
        <p className="text-sm text-muted-foreground">Riwayat gagal dimuat.</p>
      ) : history.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada riwayat.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {history.items.map((h) => (
            <li key={h.id} className="flex justify-between gap-2">
              <span><span className="font-medium">{h.action}</span> <span className="text-muted-foreground">oleh {h.userName}</span></span>
              <span className="shrink-0 text-xs text-muted-foreground">{fmtDateTime(h.historyDate)}</span>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

export function HistoryCardSkeleton() {
  return (
    <Shell>
      <div className="space-y-2" aria-label="Memuat riwayat…">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
    </Shell>
  );
}
