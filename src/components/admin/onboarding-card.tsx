"use client";

import { CheckCircle2, ChevronRight, Circle, GraduationCap, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { useAdminData } from "@/hooks/use-admin-data";
import { useOrganization } from "@/hooks/use-organization";
import { useTours } from "@/help/components/tour-provider";
import { ROUTES } from "@/lib/constants";

export function OnboardingCard() {
  const { org } = useOrganization();
  const { data, settings } = useAdminData();
  const tours = useTours();

  const steps = useMemo(() => {
    const hasCompany = Boolean(org?.document && org?.address);
    const hasLogo = Boolean(org?.branding?.logo || org?.branding?.logoLight);
    const hasVehicle = (data?.vehicles?.length ?? 0) > 0;
    const hasClient = (data?.clients?.length ?? 0) > 0;
    const hasPayment = Boolean(settings.pix?.key || settings.infinitepay?.handle);
    const hasContract = (data?.contracts?.length ?? 0) > 0;

    // help = tutorial da Central de Ajuda que ensina o item.
    return [
      { id: "company", label: "Dados da empresa (CNPJ e endereço)", done: hasCompany, href: "/admin/settings#empresa", help: "configurar-empresa-dados", tour: "settings-empresa" },
      { id: "logo", label: "Identidade visual (logo e cores)", done: hasLogo, href: "/admin/settings#aparencia", help: "configurar-identidade-visual", tour: "settings-aparencia" },
      { id: "vehicle", label: "Cadastrar primeiro veículo", done: hasVehicle, href: "/admin/vehicles", help: "cadastrar-veiculo", tour: "vehicles" },
      { id: "client", label: "Cadastrar primeiro cliente", done: hasClient, href: "/admin/clients", help: "cadastrar-cliente", tour: "clients" },
      { id: "payment", label: "Configurar pagamentos (Pix / InfinitePay / Asaas)", done: hasPayment, href: "/admin/settings#pagamentos", help: "configurar-meios-pagamento", tour: "settings-pagamentos" },
      { id: "contract", label: "Configurar modelo de contrato", done: hasContract, href: "/admin/settings#contratos", help: "modelos-contrato-ia", tour: "settings-contratos" },
    ];
  }, [org, data, settings]);

  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);

  // Se tudo estiver concluído, esconde o card
  if (pct === 100) return null;

  return (
    <section data-tour="dashboard-onboarding" className="rounded-2xl border border-line bg-gradient-to-br from-panel to-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-brand-soft uppercase tracking-wider">
            <Sparkles className="size-3.5" /> Primeiros passos
          </div>
          <h2 className="mt-1 font-display text-lg font-bold text-white">Configure sua locadora</h2>
          <p className="mt-0.5 text-xs text-muted">Complete as configurações para começar a operar com a sua marca.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="font-display text-2xl font-bold text-white">{pct}%</span>
            <p className="text-[11px] text-muted">concluído</p>
          </div>
          <div className="h-2 w-28 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-gradient-to-r from-magenta to-brand transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s) => (
          <div key={s.id} className="flex items-center gap-1 rounded-xl border border-line bg-white/[0.02] text-xs text-zinc-300 transition-colors hover:border-line-strong">
            <Link href={s.href} className="flex min-w-0 flex-1 items-center justify-between gap-2 p-3 hover:text-white">
              <div className="flex items-center gap-2 min-w-0">
                {s.done ? <CheckCircle2 className="size-4 text-emerald-400 shrink-0" /> : <Circle className="size-4 text-zinc-600 shrink-0" />}
                <span className="truncate">{s.label}</span>
              </div>
              <ChevronRight className="size-3.5 text-muted shrink-0" />
            </Link>
            {!s.done && (
              <>
                {tours && (
                  <button
                    type="button"
                    onClick={() => void tours.start(s.tour, "quick")}
                    title="Aprender com o tour"
                    aria-label={`Aprender com o tour: ${s.label}`}
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-brand-soft hover:bg-white/[0.05]"
                  >
                    <GraduationCap className="size-4" />
                  </button>
                )}
                <Link href={`${ROUTES.help}/artigo/${s.help}`} className="shrink-0 px-3 py-3 text-[11px] font-semibold text-brand-soft hover:underline" aria-label={`Ver como fazer: ${s.label}`}>
                  Como fazer
                </Link>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
