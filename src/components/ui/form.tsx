import { cn } from "@/lib/utils";

const control =
  "w-full rounded-xl border border-line bg-white/[0.03] px-3 text-sm text-white placeholder:text-zinc-500 transition-colors hover:border-line-strong focus-visible:border-brand-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-magenta/30 disabled:opacity-50 aria-[invalid=true]:border-red-400/60";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(control, "h-10 [color-scheme:dark]", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 py-2.5", className)} {...props} />;
}

export interface Option {
  value: string;
  label: string;
}

export function Select({
  options,
  placeholder,
  className,
  ...props
}: React.ComponentProps<"select"> & { options: Option[]; placeholder?: string }) {
  return (
    <select className={cn(control, "h-10 cursor-pointer bg-panel pr-8", className)} {...props}>
      {placeholder != null && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-xs font-semibold uppercase tracking-wide text-muted", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-brand-soft"> *</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

export function Checkbox({ label, className, ...props }: React.ComponentProps<"input"> & { label: string }) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-2.5 text-sm text-zinc-200", className)}>
      <input type="checkbox" className="size-4 cursor-pointer accent-magenta" {...props} />
      {label}
    </label>
  );
}
