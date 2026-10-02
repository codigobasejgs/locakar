"use client";

import { CheckCircle2, ChevronRight, HelpCircle, Layers } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { articles } from "@/help";
import { contextualArticles } from "@/help/access";
import { useHelp } from "@/help/components/context";

export function ContextualHelpButton() {
  const pathname = usePathname();
  const { access, base, progress } = useHelp();
  const [open, setOpen] = useState(false);

  // Não exibe o botão se já estiver dentro da própria Central de Ajuda
  const inHelp = pathname.startsWith("/admin/ajuda") || pathname.startsWith("/ajuda");

  const matches = useMemo(() => {
    return contextualArticles(articles, pathname, access);
  }, [pathname, access]);

  if (inHelp) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="hidden md:inline-flex items-center gap-1.5 text-xs text-brand-soft hover:bg-magenta/10 hover:text-white border border-transparent hover:border-magenta/25"
        title="Ajuda sobre esta página"
        aria-label="Abrir ajuda sobre esta página"
      >
        <HelpCircle className="size-4" />
        <span>Ajuda</span>
      </Button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Ajuda sobre esta página"
        description="Tutoriais e dúvidas frequentes recomendados para o que você está fazendo agora."
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
          {!matches.length ? (
            <p className="text-xs text-muted py-4 text-center">
              Nenhum tutorial específico mapeado para esta página no momento. Consulte a Central de Ajuda completa abaixo.
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
                <Layers className="size-3.5" /> Trilhas de Treinamento
              </Link>
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
