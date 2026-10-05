"use client";

import { GraduationCap, Rocket, Sparkles, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useAdminData } from "@/hooks/use-admin-data";
import { useCurrentRoute } from "@/lib/tour-flag";
import { canTakeTour, hasQuickMode, toursForRoute } from "../tours";
import type { TourDef } from "../types";
import { useHelp } from "./context";
import { useTours } from "./tour-provider";

/** Locadora nova = ainda sem veículos. Conta antiga, já em uso, não recebe o convite de boas-vindas. */
function useIsNewAccount() {
  const { data } = useAdminData();
  return data ? data.vehicles.length === 0 && data.rentals.length === 0 : null;
}

/**
 * Convites do tour, sempre dispensáveis:
 * - boas-vindas no primeiro acesso de dono/administrador de uma locadora nova;
 * - na primeira visita a uma tela com tour, um cartão discreto "Quer aprender a usar esta área?".
 * Cada convite aparece uma vez; "Agora não" é respeitado e o tour continua disponível no botão Ajuda.
 */
export function TourInvites() {
  const tours = useTours();
  const { access, identity } = useHelp();
  const pathname = usePathname();
  const isNew = useIsNewAccount();
  const [catalog, setCatalog] = useState<TourDef[] | null>(null);
  const route = useCurrentRoute(pathname);

  const owner = access.role === "owner" || access.role === "admin";
  const canWelcome = Boolean(tours?.loaded && !tours.state.welcome && isNew && owner);
  // Convite por tela: para quem já passou pelas boas-vindas e para quem nunca as recebe
  // (locadora já em uso, funcionários). Espera saber se a conta é nova para não sobrepor as boas-vindas.
  const welcomeSettled = Boolean(tours?.state.welcome) || (isNew !== null && !(isNew && owner));
  const pageTours = useMemo(() => (catalog ? toursForRoute(catalog, route, access) : []), [catalog, route, access]);
  const pageTour = pageTours[0];
  const seen = Boolean(pageTour && tours?.state.tours[pageTour.id]);
  const canPrompt = Boolean(tours?.loaded && welcomeSettled && pageTour && !seen && !tours.state.prompted.includes(pageTour.id) && !tours.running);

  // O catálogo só é carregado quando há chance de convite.
  useEffect(() => {
    if (!tours || !tours.loaded || catalog) return;
    if (canWelcome || welcomeSettled) void tours.loadCatalog().then((c) => setCatalog(c.tours));
  }, [tours, catalog, canWelcome, welcomeSettled]);

  if (!tours || tours.running || pathname.startsWith("/admin/ajuda")) return null;
  if (canWelcome && catalog) {
    const general = catalog.find((t) => t.id === "conheca-seu-sistema");
    const setup = catalog.find((t) => t.id === "jornada-prepare-sua-locadora" && canTakeTour(t, access));
    return (
      <Welcome
        name={identity.orgName}
        minutes={general?.minutes ?? 4}
        onTour={() => (tours.dismissWelcome("done"), void tours.start("conheca-seu-sistema"))}
        onSetup={setup ? () => (tours.dismissWelcome("done"), void tours.start(setup.id)) : undefined}
        onLater={() => tours.dismissWelcome("later")}
      />
    );
  }
  if (canPrompt && pageTour) {
    return (
      <PagePrompt
        key={pageTour.id}
        tour={pageTour}
        onStart={(mode) => (tours.markPrompted(pageTour.id), void tours.start(pageTour.id, mode))}
        onDismiss={() => tours.markPrompted(pageTour.id)}
      />
    );
  }
  return null;
}

function Welcome({ name, minutes, onTour, onSetup, onLater }: { name: string; minutes: number; onTour: () => void; onSetup?: () => void; onLater: () => void }) {
  useEffect(() => {
    document.getElementById("tour-welcome-start")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onLater();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onLater]);
  return createPortal(
    <div className="tour-root fixed inset-0 z-[60] grid place-items-center p-4">
      <div aria-hidden className="tour-dim fixed inset-0" />
      <div role="dialog" aria-modal="true" aria-labelledby="tour-welcome-title" className="tour-pop relative w-full max-w-md rounded-2xl border border-line-strong bg-panel p-6 shadow-2xl">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-soft">
          <Sparkles className="size-4" /> Bem-vindo{name ? ` à ${name}` : ""}
        </p>
        <h2 id="tour-welcome-title" className="mt-2 font-display text-xl font-semibold text-white">
          Sua plataforma está pronta.
        </h2>
        <p className="mt-2 text-sm text-zinc-300">
          Quer conhecer as principais áreas? Leva aproximadamente {minutes} minutos e você pode parar quando quiser.
        </p>
        <div className="mt-5 grid gap-2">
          <Button id="tour-welcome-start" onClick={onTour}>
            <GraduationCap /> Conhecer meu sistema
          </Button>
          {onSetup && (
            <Button variant="outline" onClick={onSetup}>
              <Rocket /> Configurar minha locadora
            </Button>
          )}
          <Button variant="ghost" onClick={onLater}>
            Agora não
          </Button>
        </div>
        <p className="mt-3 text-center text-xs text-muted">O treinamento fica sempre disponível em Ajuda e Treinamento.</p>
      </div>
    </div>,
    document.body,
  );
}

/** Cartão discreto no canto: não cobre a tela nem rouba o foco. */
function PagePrompt({ tour, onStart, onDismiss }: { tour: TourDef; onStart: (mode: "quick" | "full") => void; onDismiss: () => void }) {
  const quick = hasQuickMode(tour);
  return (
    <aside aria-label={`Treinamento: ${tour.title}`} className="tour-pop no-print fixed bottom-4 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-line-strong bg-panel p-4 shadow-2xl">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-white">Quer aprender a usar esta área?</p>
        <button type="button" onClick={onDismiss} aria-label="Agora não" className="-m-1 grid size-7 place-items-center rounded-lg text-muted hover:bg-white/[0.06] hover:text-white">
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">
        {tour.title} · cerca de {tour.minutes} min. O tour só mostra e explica: nada é alterado.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {quick && (
          <Button size="sm" variant="outline" onClick={() => onStart("quick")}>
            Tour rápido
          </Button>
        )}
        <Button size="sm" onClick={() => onStart("full")}>
          {quick ? "Treinamento completo" : "Começar tour"}
        </Button>
      </div>
    </aside>
  );
}
