"use client";

import { CheckCircle2, ChevronRight, HelpCircle, Layers, PlayCircle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useCurrentRoute } from "@/lib/tour-flag";
import { articles } from "@/help";
import { contextualArticles } from "@/help/access";
import { useHelp } from "@/help/components/context";
import { tourStatus } from "../tour-progress";
import { hasQuickMode, tourSteps, toursForRoute } from "../tours";
import type { TourDef } from "../types";
import { useTours } from "./tour-provider";

export function ContextualHelpButton() {
  const pathname = usePathname();
  const route = useCurrentRoute(pathname);
  const { access, base, progress } = useHelp();
  const tours = useTours();
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<TourDef[] | null>(null);

  // Não exibe o botão se já estiver dentro da própria Central de Ajuda
  const inHelp = pathname.startsWith("/admin/ajuda") || pathname.startsWith("/ajuda");

  const matches = useMemo(() => contextualArticles(articles, route, access), [route, access]);
  const pageTours = useMemo(() => (catalog ? toursForRoute(catalog, route, access) : []), [catalog, route, access]);

  useEffect(() => {
    if (open && tours && !catalog) void tours.loadCatalog().then((c) => setCatalog(c.tours));
  }, [open, tours, catalog]);

  if (inHelp) return null;

  const run = (id: string, mode: "quick" | "full", resume = false) => {
    setOpen(false);
    void tours?.start(id, mode, resume);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        data-tour="topbar-help"
        className="inline-flex items-center gap-1.5 text-xs text-brand-soft hover:bg-magenta/10 hover:text-white border border-transparent hover:border-magenta/25"
        title="Ajuda sobre esta página"
        aria-label="Abrir ajuda sobre esta página"
      >
        <HelpCircle className="size-4" />
        <span className="hidden md:inline">Ajuda</span>
      </Button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Ajuda sobre esta página"
        description="Tour pela tela, guias passo a passo e dúvidas frequentes do que você está fazendo agora."
        size="md"
        footer={
          <div className="flex w-full items-center justify-between">
            <span className="text-xs text-muted">
              {progress.completed.length} tutorial(is) concluído(s)
            </span>
            <Button asChild size="sm">
              <Link href={base} onClick={() => setOpen(false)}>
                Abrir Central de Ajuda completa ↗
              </Link>
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {tours && pageTours.length > 0 && (
            <section aria-label="Tours desta tela" className="space-y-2">
              {pageTours.map((t) => {
                const record = tours.state.tours[t.id];
                const status = tourStatus(record, t);
                const total = tourSteps(t, access, record?.mode ?? "full").length;
                return (
                  <div key={t.id} className="rounded-xl border border-magenta/30 bg-magenta/[0.06] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex items-center gap-2 text-sm font-semibold text-white">
                        <PlayCircle className="size-4 text-brand-soft" /> {t.title}
                      </p>
                      {status === "done" && <CheckCircle2 className="size-4 text-emerald-400" aria-label="Concluído" />}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {status === "in_progress" && record
                        ? `Você parou no passo ${record.step + 1} de ${total}.`
                        : status === "updated"
                          ? "Este treinamento foi atualizado desde que você concluiu."
                          : `${t.description} Cerca de ${t.minutes} min.`}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {status === "in_progress" && record ? (
                        <Button size="sm" onClick={() => run(t.id, record.mode, true)}>
                          Continuar treinamento
                        </Button>
                      ) : (
                        <>
                          {hasQuickMode(t) && (
                            <Button size="sm" variant="outline" onClick={() => run(t.id, "quick")}>
                              Tour rápido
                            </Button>
                          )}
                          <Button size="sm" onClick={() => run(t.id, "full")}>
                            {status === "done" ? <RotateCcw /> : null}
                            {status === "done" ? "Refazer" : hasQuickMode(t) ? "Treinamento completo" : "Fazer tour desta tela"}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {!matches.length ? (
            <p className="text-xs text-muted py-4 text-center">
              Nenhum guia específico para esta página no momento. Consulte a Central de Ajuda completa abaixo.
            </p>
          ) : (
            <div className="divide-y divide-line rounded-xl border border-line bg-surface overflow-hidden">
              {matches.map((art) => {
                const isDone = progress.completed.includes(art.slug);
                return (
                  <Link
                    key={art.slug}
                    href={`${base}/artigo/${art.slug}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between gap-3 p-3 text-xs transition-colors hover:bg-white/[0.04]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white truncate">{art.title}</span>
                        {isDone && <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />}
                      </div>
                      <p className="text-[11px] text-muted truncate mt-0.5">{art.description}</p>
                    </div>
                    <ChevronRight className="size-3.5 text-muted shrink-0" />
                  </Link>
                );
              })}
            </div>
          )}

          <div className="pt-2 flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="text-xs">
              <Link href={`${base}/faq`} onClick={() => setOpen(false)}>
                <HelpCircle className="size-3.5" /> Ver Dúvidas Frequentes (FAQ)
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="text-xs">
              <Link href={`${base}/treinamentos`} onClick={() => setOpen(false)}>
                <Layers className="size-3.5" /> Trilhas e tours
              </Link>
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
