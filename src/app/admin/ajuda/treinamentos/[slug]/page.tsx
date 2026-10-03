"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { CheckCircle2, Clock } from "lucide-react";
import { useHelp } from "@/help/components/context";
import { Breadcrumb } from "@/help/components/ui";
import { articles, trainingsOf } from "@/help";
import { canReadArticle, featureAvailable } from "@/help/access";

export default function TrainingDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { access, base, progress } = useHelp();

  const visible = useMemo(() => articles.filter((a) => canReadArticle(a, access) && featureAvailable(a, access)), [access]);
  const training = useMemo(() => trainingsOf(visible).find((t) => t.slug === slug), [visible, slug]);

  if (!training) {
    return <p className="text-sm text-muted">Trilha de treinamento não encontrada.</p>;
  }

  const doneCount = training.lessons.filter((l) => progress.completed.includes(l.slug)).length;
  const pct = Math.round((doneCount / training.lessons.length) * 100);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Ajuda", href: base }, { label: "Treinamentos", href: `${base}/treinamentos` }, { label: training.title }]} />

      <header className="border-b border-line pb-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-white">{training.title}</h1>
            <p className="mt-1 text-xs text-muted">{training.description}</p>
          </div>
          <div className="text-right">
            <span className="font-display text-2xl font-bold text-white">{pct}%</span>
            <p className="text-[11px] text-muted">{doneCount} de {training.lessons.length} aulas concluídas</p>
          </div>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-gradient-to-r from-magenta to-brand transition-all" style={{ width: `${pct}%` }} />
        </div>
      </header>

      <div className="space-y-3">
        <h2 className="font-semibold text-sm text-white">Conteúdo programático</h2>
        <div className="divide-y divide-line rounded-2xl border border-line bg-surface overflow-hidden">
          {training.lessons.map((lesson, idx) => {
            const isDone = progress.completed.includes(lesson.slug);
            return (
              <Link
                key={lesson.slug}
                href={`${base}/artigo/${lesson.slug}`}
                className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-white/[0.04]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {isDone ? (
                    <CheckCircle2 className="size-5 text-emerald-400 shrink-0" />
                  ) : (
                    <span className="grid size-5 place-items-center rounded-full border border-zinc-600 text-[10px] font-bold text-muted shrink-0">
                      {idx + 1}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className={`font-semibold text-sm truncate ${isDone ? "text-zinc-300" : "text-white"}`}>{lesson.title}</p>
                    <p className="text-xs text-muted truncate">{lesson.description}</p>
                  </div>
                </div>
                <span className="text-xs text-muted flex items-center gap-1 shrink-0">
                  <Clock className="size-3" /> {lesson.minutes} min
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
