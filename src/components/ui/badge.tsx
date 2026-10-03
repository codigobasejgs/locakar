import type { Tone } from "@/lib/constants";
import { cn } from "@/lib/utils";

const TONE_CLASS: Record<Tone, string> = {
  success: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/25",
  brand: "bg-magenta/15 text-brand-soft ring-magenta/35",
  info: "bg-sky-400/10 text-sky-300 ring-sky-400/25",
  warning: "bg-amber-400/10 text-amber-300 ring-amber-400/25",
  danger: "bg-red-400/10 text-red-300 ring-red-400/25",
  neutral: "bg-white/5 text-zinc-300 ring-white/10",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
        TONE_CLASS[tone],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

/** Badge a partir de um mapa de status (`VEHICLE_STATUS`, `RENTAL_STATUS`...). */
export function StatusBadge<K extends string>({ map, value }: { map: Record<K, { label: string; tone: Tone }>; value: K }) {
  const status = map[value];
  return status ? <Badge tone={status.tone}>{status.label}</Badge> : null;
}
