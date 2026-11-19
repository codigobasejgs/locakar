"use client";

import { Lock, Sparkles } from "lucide-react";
import { usePlanFeature } from "@/hooks/use-organization";
import { FEATURE_LABEL, FEATURE_MIN_PLAN, type PlanFeature } from "@/lib/plans";
import { PLATFORM } from "@/lib/platform";
import { cn } from "@/lib/utils";

const upgradeLink = (f: PlanFeature) =>
  `https://wa.me/${PLATFORM.whatsapp.e164}?text=${encodeURIComponent(`Olá! Quero fazer upgrade do meu plano ${PLATFORM.name} para liberar: ${FEATURE_LABEL[f]}.`)}`;

/** Card de upgrade elegante no lugar do recurso que o plano não inclui (o backend também bloqueia). */
export function UpgradeCard({ feature, className }: { feature: PlanFeature; className?: string }) {
  return (
    <div role="note" className={cn("flex flex-col gap-3 rounded-2xl border border-[#a64dff]/35 bg-gradient-to-br from-[#7a00ff]/15 to-transparent p-5 sm:col-span-2 sm:flex-row sm:items-center", className)}>
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#7a00ff]/25 text-[#c79bff]">
        <Lock className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-white">{FEATURE_LABEL[feature]}</p>
        <p className="mt-0.5 text-sm text-muted">Recurso disponível a partir do plano {FEATURE_MIN_PLAN[feature]}.</p>
      </div>
      <a href={upgradeLink(feature)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7a00ff] to-[#a64dff] px-4 text-sm font-semibold text-white">
        <Sparkles className="size-4" aria-hidden /> Fazer upgrade
      </a>
    </div>
  );
}

/** Mostra os filhos só se o plano incluir o recurso; senão, o card de upgrade. */
export function PlanGate({ feature, children }: { feature: PlanFeature; children: React.ReactNode }) {
  return usePlanFeature(feature) ? <>{children}</> : <UpgradeCard feature={feature} />;
}
