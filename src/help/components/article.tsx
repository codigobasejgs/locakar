"use client";

import { AlertTriangle, Clock, HelpCircle, ShieldAlert, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useHelp } from "@/help/components/context";
import { ArticleActions, Breadcrumb, NoticeBox, StepItem } from "@/help/components/ui";
import { articles, categoryName, relatedArticles } from "@/help";
import { canReadArticle, featureAvailable } from "@/help/access";

export default function ArticleDetail({ slug }: { slug: string }) {
  const { access, base, setProgress } = useHelp();
  const article = useMemo(() => articles.find((a) => a.slug === slug), [slug]);

  useEffect(() => {
    if (article) {
      setProgress((p) => ({ ...p, recent: [article.slug, ...p.recent.filter((s) => s !== article.slug)].slice(0, 10) }));
    }
  }, [article, setProgress]);

  if (!article || !canReadArticle(article, access) || !featureAvailable(article, access)) {
    return (
      <Card className="p-8 text-center space-y-3">
        <ShieldAlert className="size-8 text-amber-400 mx-auto" />
        <h2 className="font-semibold text-white">Artigo não encontrado ou restrito</h2>
        <p className="text-xs text-muted max-w-md mx-auto">
          Este tutorial pode ter sido movido ou exige permissões de acesso que seu perfil não possui.
        </p>
        <Link href={base} className="text-xs font-semibold text-brand-soft hover:underline">
          Voltar para a Central de Ajuda
        </Link>
      </Card>
    );
  }

  const related = relatedArticles(article, articles.filter((a) => canReadArticle(a, access) && featureAvailable(a, access)));

  return (
    <article className="max-w-4xl mx-auto space-y-8">
      <Breadcrumb
        items={[
          { label: "Ajuda", href: base },
          { label: categoryName(article.category), href: `${base}/categoria/${article.category}` },
          { label: article.title },
        ]}
      />

      {/* Cabeçalho do artigo */}
      <header className="space-y-3 border-b border-line pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={article.difficulty === "Iniciante" ? "success" : "brand"}>{article.difficulty ?? "Tutorial"}</Badge>
          <span className="text-xs text-muted flex items-center gap-1"><Clock className="size-3.5" /> Tempo estimado: {article.minutes} min</span>
          <span className="text-xs text-muted">· Revisado em {article.updated} (v{article.version})</span>
        </div>
        <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">{article.title}</h1>
        <p className="text-sm leading-relaxed text-zinc-300">{article.description}</p>
      </header>

      {/* Pré-requisitos */}
      {article.prerequisites.length > 0 && (
        <section aria-label="Antes de começar" className="rounded-2xl border border-line bg-surface p-4 text-xs space-y-2">
          <p className="font-semibold text-white flex items-center gap-1.5">
            <Sparkles className="size-4 text-brand-soft" /> Antes de começar:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-zinc-300">
            {article.prerequisites.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Passos do tutorial */}
      <section aria-label="Passo a passo" className="space-y-4">
        <h2 className="font-display text-lg font-bold text-white">Passo a passo</h2>
        <ol className="space-y-6 before:border-l before:border-line">
          {article.steps.map((step, idx) => (
            <StepItem key={idx} step={step} index={idx} />
          ))}
        </ol>
      </section>

      {/* Resultado */}
      {article.result && (
        <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-xs text-emerald-200 space-y-1">
          <p className="font-semibold text-emerald-300">✓ O que acontece depois?</p>
          <p className="leading-relaxed">{article.result}</p>
        </section>
      )}

      {/* Dicas e Avisos */}
      <div className="grid gap-3 sm:grid-cols-2">
        {article.tips.map((t, i) => (
          <NoticeBox key={i} type="tip" title="Dica útil" text={t} />
        ))}
        {article.warnings.map((w, i) => (
          <NoticeBox key={i} type="warning" title="Atenção" text={w} />
        ))}
      </div>

      {/* Resolução de problemas comuns */}
      {article.problems.length > 0 && (
        <section aria-label="Problemas comuns" className="space-y-3 rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-display text-base font-semibold text-white flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-400" /> Problemas comuns e soluções
          </h2>
          <div className="divide-y divide-line text-xs">
            {article.problems.map((p, i) => (
              <div key={i} className="py-3 space-y-1 first:pt-1 last:pb-1">
                <p className="font-semibold text-white">❓ {p.question}</p>
                <p className="text-muted leading-relaxed">{p.answer}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Dúvidas frequentes do módulo */}
      {article.faq.length > 0 && (
        <section aria-label="Dúvidas frequentes" className="space-y-3 rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-display text-base font-semibold text-white flex items-center gap-2">
            <HelpCircle className="size-4 text-brand-soft" /> Perguntas frequentes relacionadas
          </h2>
          <div className="divide-y divide-line text-xs">
            {article.faq.map((f, i) => (
              <div key={i} className="py-3 space-y-1 first:pt-1 last:pb-1">
                <p className="font-semibold text-white">{f.question}</p>
                <p className="text-muted leading-relaxed">{f.answer}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Ações, conclusão e feedback */}
      <ArticleActions article={article} />

      {/* Artigos relacionados */}
      {related.length > 0 && (
        <section className="no-print space-y-3 pt-4 border-t border-line">
          <h2 className="font-display text-sm font-semibold text-white">Veja também</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {related.map((r) => (
              <Link
                key={r.slug}
                href={`${base}/artigo/${r.slug}`}
                className="rounded-xl border border-line bg-surface p-3 text-xs transition-colors hover:border-line-strong hover:bg-white/[0.03] space-y-1 block"
              >
                <p className="font-medium text-white truncate">{r.title}</p>
                <p className="text-muted line-clamp-1">{r.description}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
