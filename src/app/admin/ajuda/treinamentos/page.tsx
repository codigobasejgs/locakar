"use client";

import { Layers } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { useHelp } from "@/help/components/context";
import { Breadcrumb } from "@/help/components/ui";
import { articles, trainingsOf } from "@/help";
import { canReadArticle, featureAvailable } from "@/help/access";

export default function TrainingsPage() {
  const { access, base, progress } = useHelp();

  const visible = useMemo(() => articles.filter((a) => canReadArticle(a, access) && featureAvailable(a, access)), [access]);
  const trainings = useMemo(() => trainingsOf(visible), [visible]);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Ajuda", href: base }, { label: "Trilhas de Treinamento" }]} />

      <header className="border-b border-line pb-4">
        <h1 className="font-display text-2xl font-bold text-white flex items-center gap-2">
          <Layers className="size-6 text-brand-soft" /> Trilhas de Treinamento
        </h1>
        <p className="mt-1 text-xs text-muted">Cursos estruturados para capacitação rápida de novos colaboradores e proprietários.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {trainings.map((t) => {
          const done = t.lessons.filter((l) => progress.completed.includes(l.slug)).length;
          const pct = Math.round((done / t.lessons.length) * 100);
          return (
            <Link
              key={t.slug}
              href={`${base}/treinamentos/${t.slug}`}
              className="rounded-2xl border border-line bg-surface p-5 space-y-3 transition-colors hover:border-line-strong hover:bg-white/[0.04] block"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-brand-soft uppercase tracking-wider">{t.lessons.length} aulas</span>
                <span className="text-xs text-muted font-medium">{pct}% concluído</span>
              </div>
              <div>
                <h2 className="font-display text-base font-bold text-white">{t.title}</h2>
                <p className="mt-1 text-xs text-muted line-clamp-2">{t.description}</p>
              </div>

              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-gradient-to-r from-magenta to-brand transition-all" style={{ width: `${pct}%` }} />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
