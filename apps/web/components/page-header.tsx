export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b pb-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Ditampilkan bila role tidak punya hak lihat menu (API juga menolak dengan 403). */
export function Forbidden() {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm">
      <p className="font-medium text-destructive">Akses ditolak</p>
      <p className="mt-1 text-muted-foreground">Role Anda tidak memiliki akses ke menu ini. Hubungi administrator untuk mengatur Hak Akses Role.</p>
    </div>
  );
}
