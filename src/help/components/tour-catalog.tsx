"use client";

import {
  CalendarDays, CarFront, ChartColumn, CheckCircle2, Circle, CreditCard, FileCheck, GraduationCap, KeyRound, LayoutDashboard,
  NotebookPen, PlayCircle, Receipt, RotateCcw, Route, Satellite, Settings, ShieldCheck, Smartphone, TriangleAlert, Users, Wallet, Wrench,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { tourStatus, type TourStatus } from "../tour-progress";
import { hasQuickMode, tourSteps, visibleTours } from "../tours";
import type { TourDef } from "../types";
import { useHelp } from "./context";
import { useTours } from "./tour-provider";

const ICONS: Record<string, LucideIcon> = {
  "primeiros-passos": GraduationCap, dashboard: LayoutDashboard, solicitacoes: FileCheck, locacoes: KeyRound, reservas: CalendarDays,
  veiculos: CarFront, rastreamento: Satellite, clientes: Users, pagamentos: CreditCard, financeiro: Wallet, despesas: Receipt,
  manutencao: Wrench, multas: TriangleAlert, anotacoes: NotebookPen, ocorrencias: Smartphone, seguranca: ShieldCheck,
  relatorios: ChartColumn, vistorias: Route,
};
export function TourIcon({ module }: { module: string }) {
  const Icon = ICONS[module] ?? Settings;
  return <Icon className="size-4" aria-hidden />;
}

const LABEL: Record<TourStatus, string> = { new: "Não iniciado", in_progress: "Em andamento", done: "Concluído", updated: "Atualizado" };

/** Catálogo de tours carregado sob demanda e filtrado pelo perfil da pessoa. */
export function useTourCatalog() {
  const tours = useTours();
  const { access } = useHelp();
  const [list, setList] = useState<TourDef[] | null>(null);
  useEffect(() => {
    if (tours) void tours.loadCatalog().then((c) => setList(c.tours));
  }, [tours]);
  return useMemo(() => (list ? visibleTours(list, access) : null), [list, access]);
}

/** Uma linha de tour com status real e ações (começar, rápido, continuar, refazer). */
export function TourRow({ tour, compact }: { tour: TourDef; compact?: boolean }) {
  const tours = useTours();
  const { access } = useHelp();
  if (!tours) return null;
  const record = tours.state.tours[tour.id];
  const status = tourStatus(record, tour);
  const total = tourSteps(tour, access, record?.mode ?? "full").length;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-magenta/12 text-brand-soft ring-1 ring-magenta/25">
          <TourIcon module={tour.module} />
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
            {status === "done" ? <CheckCircle2 className="size-3.5 text-emerald-400" aria-hidden /> : <Circle className="size-3.5 text-zinc-600" aria-hidden />}
            {tour.title}
          </p>
          {!compact && <p className="text-xs text-muted">{tour.description}</p>}
          <p className="mt-0.5 text-[11px] text-muted">
            {LABEL[status]} · {total} passos · ~{tour.minutes} min
            {status === "in_progress" && record ? ` · parou no passo ${record.step + 1}` : ""}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {status === "in_progress" && record ? (
          <Button size="sm" onClick={() => void tours.start(tour.id, record.mode, true)}>
            Continuar
          </Button>
        ) : (
          <>
            {hasQuickMode(tour) && status !== "done" && (
              <Button size="sm" variant="outline" onClick={() => void tours.start(tour.id, "quick")}>
                Rápido
              </Button>
            )}
            <Button size="sm" variant={status === "done" ? "outline" : "primary"} onClick={() => void tours.start(tour.id, "full")}>
              {status === "done" ? <RotateCcw /> : <PlayCircle />} {status === "done" ? "Refazer tour" : status === "updated" ? "Ver novidades" : "Começar"}
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

/** "Aprenda a usar o sistema": continuar de onde parou, jornadas e tours por área. */
export function LearnSection({ limit }: { limit?: number }) {
  const list = useTourCatalog();
  const tours = useTours();
  if (!tours || !list?.length) return null;
  const resume = list.filter((t) => tourStatus(tours.state.tours[t.id], t) === "in_progress");
  const general = list.filter((t) => t.kind === "geral" || t.kind === "jornada");
  const modules = list.filter((t) => t.kind === "modulo" || t.kind === "configuracao");
  const done = list.filter((t) => tourStatus(tours.state.tours[t.id], t) === "done").length;
  const pct = Math.round((done / list.length) * 100);
  return (
    <section aria-labelledby="learn-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="learn-title" className="flex items-center gap-2 font-display text-lg font-bold text-white">
            <GraduationCap className="size-5 text-brand-soft" /> Aprenda a usar o sistema
          </h2>
          <p className="text-xs text-muted">Tours guiados sobre a tela real: o sistema destaca cada área e explica. Nada é alterado.</p>
        </div>
        <div className="flex items-center gap-3" aria-label={`${pct}% dos treinamentos concluídos`}>
          <span className="text-xs text-muted">{done} de {list.length} concluídos</span>
          <div className="h-2 w-28 overflow-hidden rounded-full bg-white/10" aria-hidden>
            <div className="h-full bg-gradient-to-r from-magenta to-brand" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
      {resume.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-soft">Continuar aprendendo</h3>
          <ul className="grid gap-2">{resume.map((t) => <TourRow key={t.id} tour={t} compact />)}</ul>
        </div>
      )}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Comece por aqui e jornadas</h3>
        <ul className="grid gap-2 lg:grid-cols-2">{general.map((t) => <TourRow key={t.id} tour={t} />)}</ul>
      </div>
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Tours por área</h3>
        <ul className="grid gap-2 lg:grid-cols-2">{(limit ? modules.slice(0, limit) : modules).map((t) => <TourRow key={t.id} tour={t} compact />)}</ul>
      </div>
    </section>
  );
}

/** Tours de um módulo da Central (categoria ou trilha): "Fazer tour desta tela" ao lado dos guias. */
export function ModuleTours({ module }: { module: string }) {
  const list = useTourCatalog();
  const items = list?.filter((t) => t.module === module) ?? [];
  if (!items.length) return null;
  return (
    <section aria-label="Tours guiados" className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
        <PlayCircle className="size-4 text-brand-soft" /> Tours guiados nesta área
      </h2>
      <ul className="grid gap-2">{items.map((t) => <TourRow key={t.id} tour={t} />)}</ul>
    </section>
  );
}
