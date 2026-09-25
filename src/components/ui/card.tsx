import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-2xl border border-line bg-panel", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 px-5 pt-5", className)}>
      <div>
        <h2 className="font-display text-base font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  hint?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Card
      className={cn(
        "group relative overflow-hidden p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-line-strong sm:p-5",
        accent && "border-magenta/30 bg-gradient-to-br from-brand-deep/30 via-panel to-panel",
      )}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full bg-magenta/10 blur-2xl transition-opacity duration-300 group-hover:opacity-100 sm:opacity-60" />
      <div className="relative flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        <span className="grid size-8 place-items-center rounded-lg bg-magenta/12 text-brand-soft ring-1 ring-magenta/25">
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p className="relative mt-3 font-display text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>
      {hint && <p className="relative mt-1 text-xs text-zinc-500">{hint}</p>}
    </Card>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-6 py-14 text-center">
      <p className="font-medium text-zinc-200">{title}</p>
      {description && <p className="text-sm text-muted">{description}</p>}
    </div>
  );
}
