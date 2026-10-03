import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Lista chave/valor para modais de visualização. */
export function DetailList({ items }: { items: { label: string; value: React.ReactNode; wide?: boolean }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className={cn("min-w-0", item.wide && "sm:col-span-2")}>
          <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{item.label}</dt>
          <dd className="mt-1 break-words text-sm text-zinc-100">{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
