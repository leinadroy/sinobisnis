import { cn } from "@/lib/utils";

export type CardField = [label: string, value: React.ReactNode];

/**
 * Kartu satu baris untuk tampilan HP (prop `renderCard` di DataTable).
 * Field bernilai kosong (null/undefined/'') tidak ditampilkan.
 */
export function RecordCard({ title, subtitle, fields = [], actions, badge, className }: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  fields?: CardField[];
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}) {
  const shown = fields.filter(([, v]) => v !== null && v !== undefined && v !== "" && v !== false);
  return (
    <article className={cn("rounded-lg border bg-card p-3 text-sm shadow-xs", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold">{title}</div>
          {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
        </div>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>
      {shown.length > 0 && (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
          {shown.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
              <dd className="truncate">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {actions && <div className="mt-2 flex flex-wrap justify-end gap-1 border-t pt-2">{actions}</div>}
    </article>
  );
}
