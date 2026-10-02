"use client";

import { AlertTriangle, Building2, Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/ui/logo";
import { useOrganization } from "@/hooks/use-organization";
import { ROLE_LABEL } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/** Logo da locadora atual (ou o selo padrão). */
export function OrgBrandLogo({ className = "w-28", variant = "light" }: { className?: string; variant?: "light" | "original" }) {
  const { org } = useOrganization();
  const b = org?.branding;
  const src = variant === "light" ? b?.logoLight || b?.logo : b?.logo;
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={b?.displayName || org?.name || "Logo"} className={cn("h-9 w-auto max-w-40 object-contain", className)} />
    );
  }
  return <Logo className={className} variant={variant} />;
}

/** Locadora em que você está (sempre visível); com mais de uma, vira seletor. */
export function OrgSwitcher() {
  const { org, memberships, switchOrg } = useOrganization();
  const [open, setOpen] = useState(false);
  if (!org) return null;
  if (memberships.length <= 1) {
    return (
      <span className="hidden items-center gap-2 rounded-xl border border-line bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white sm:inline-flex" title="Locadora atual">
        <Building2 className="size-3.5 shrink-0 text-brand-soft" />
        <span className="max-w-40 truncate">{org.branding?.displayName || org.name}</span>
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-xl border border-line bg-white/[0.03] px-3 py-1.5 text-xs text-white transition-colors hover:border-line-strong hover:bg-white/[0.06]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Building2 className="size-3.5 text-brand-soft shrink-0" />
        <span className="max-w-32 truncate font-medium">{org.branding?.displayName || org.name}</span>
        <ChevronDown className="size-3 text-muted" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="listbox" className="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-2xl border border-line-strong bg-panel p-1.5 shadow-2xl">
            <p className="px-2.5 py-1 text-[11px] font-semibold text-muted uppercase tracking-wider">Suas locadoras</p>
            {memberships.map((m) => {
              const active = m.organization_id === org.id;
              return (
                <button
                  key={m.organization_id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (!active) switchOrg(m.organization_id);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-colors",
                    active ? "bg-magenta/15 text-white font-medium" : "text-zinc-300 hover:bg-white/[0.04] hover:text-white",
                  )}
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="truncate">{m.org.branding?.displayName || m.org.name}</p>
                    <p className="text-[10px] text-muted">{ROLE_LABEL[m.role] ?? m.role}</p>
                  </div>
                  {active && <Check className="size-3.5 text-brand-soft shrink-0" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** Aviso quando a locadora está suspensa ou com pagamento pendente. */
export function OrgStatusBanner() {
  const { org, status } = useOrganization();
  if (!org || status === "active" || status === "trial") return null;
  const pastDue = status === "past_due";
  return (
    <div
      role="alert"
      className={cn(
        "no-print flex items-center justify-between gap-3 px-4 py-2 text-xs font-medium",
        pastDue ? "bg-amber-500/15 text-amber-200 border-b border-amber-500/25" : "bg-red-500/15 text-red-200 border-b border-red-500/25",
      )}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 shrink-0" />
        <span>
          {pastDue
            ? "O período de teste da sua locadora terminou. Regularize sua assinatura para não perder o acesso."
            : "Locadora suspensa. Suas operações estão bloqueadas para gravação até a regularização."}
        </span>
      </div>
      <a href="https://wa.me/5519989615873?text=Quero%20regularizar%20a%20assinatura%20da%20minha%20locadora" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">
        Falar com o suporte
      </a>
    </div>
  );
}
