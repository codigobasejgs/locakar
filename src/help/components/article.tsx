"use client";

import { AlertTriangle, Clock, HelpCircle, Lock, ShieldAlert, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useHelp } from "@/help/components/context";
import { ArticleActions, Breadcrumb, NoticeBox, StepItem, SupportCard } from "@/help/components/ui";
import { articles, categoryName, relatedArticles } from "@/help";
import { canReadArticle, featureAvailable } from "@/help/access";
import { trackHelp } from "@/help/track";

export default function ArticleDetail({ slug }: { slug: string }) {
  const { access, base, setProgress } = useHelp();
  const article = useMemo(() => articles.find((a) => a.slug === slug), [slug]);
  const readable = Boolean(article && canReadArticle(article, access));
  const tracked = useRef<string | null>(null);

  useEffect(() => {
    if (!article || !readable) return;
    setProgress((p) => ({ ...p, recent: [article.slug, ...p.recent.filter((s) => s !== article.slug)].slice(0, 10) }));
    if (tracked.current !== article.slug) {
      tracked.current = article.slug;
      trackHelp(access.audience, { kind: "view", article: article.slug });
    }
  }, [article, readable, access.audience, setProgress]);

  // "Continue de onde parou": guarda o último passo que apareceu na tela.
  useEffect(() => {
    if (!article || !readable || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const step = Number((e.target as HTMLElement).dataset.step);
          setProgress((p) => (p.lessonSteps[article.slug] >= step ? p : { ...p, lessonSteps: { ...p.lessonSteps, [article.slug]: step } }));
        }
      },
      { rootMargin: "0px 0px -40% 0px" },
    );
    document.querySelectorAll("[data-step]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [article, readable, setProgress]);

  if (!article || !readable) {
    return (
      <Card className="p-8 text-center space-y-3">
        <ShieldAlert className="size-8 text-amber-400 mx-auto" />
        <h2 className="font-semibold text-white">Artigo não encontrado ou restrito</h2>
        <p className="text-xs text-muted max-w-md mx-auto">
          Este tutorial pode ter sido movido ou exige uma permissão que seu perfil não possui. Peça ao proprietário ou administrador da locadora.
        </p>
        <Link href={base} className="text-xs font-semibold text-brand-soft hover:underline">
          Voltar para a Central de Ajuda
        </Link>
      </Card>
    );
  }

  const inPlan = featureAvailable(article, access);
  const related = relatedArticles(article, articles.filter((a) => canReadArticle(a, access) && featureAvailable(a, access)));
  const gallery = article.steps.filter((s) => s.image).map((s) => ({ src: s.image!, caption: s.caption ?? s.title, markers: s.markers }));
  const toc = [
    // Vários títulos já trazem "Passo N —" no conteúdo; não repete.
    ...article.steps.map((s, i) => ({ id: `passo-${i + 1}`, label: /^passo\s+\d/i.test(s.title) ? s.title : `Passo ${i + 1} — ${s.title}` })),
    ...(article.problems.length ? [{ id: "problemas", label: "Problemas comuns" }] : []),
    ...(article.faq.length ? [{ id: "faq", label: "Perguntas frequentes" }] : []),
  ];

  return (
    <article className="max-w-4xl mx-auto space-y-8 help-article">
      <Breadcrumb
        items={[
          { label: "Ajuda", href: base },
          { label: categoryName(article.category), href: `${base}/categoria/${article.category}` },
          { label: article.title },
        ]}
      />

      <header className="space-y-3 border-b border-line pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={article.difficulty === "Iniciante" ? "success" : "brand"}>{article.difficulty ?? "Tutorial"}</Badge>
          <span className="text-xs text-muted flex items-center gap-1"><Clock className="size-3.5" /> Tempo estimado: {article.minutes} min</span>
          <span className="text-xs text-muted">· Revisado em {article.updated} (v{article.version})</span>
        </div>
        <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">{article.title}</h1>
        <p className="text-sm leading-relaxed text-zinc-300">{article.description}</p>
      </header>

      {!inPlan && (
        <aside className="flex gap-3 rounded-xl border border-line bg-surface p-4 text-xs text-zinc-300">
          <Lock className="size-4 shrink-0 text-muted mt-0.5" />
          <p>Recurso não disponível no plano atual da sua locadora. O tutorial fica aqui para consulta; para ativar, fale com o suporte.</p>
        </aside>
      )}

      {toc.length > 3 && (
        <details className="no-print rounded-2xl border border-line bg-surface p-4 text-xs lg:open:block" open>
          <summary className="cursor-pointer font-semibold text-white">Neste artigo</summary>
          <ol className="mt-2 grid gap-1 sm:grid-cols-2">
            {toc.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`} className="text-muted hover:text-white">{t.label}</a>
              </li>
            ))}
          </ol>
        </details>
      )}

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

      <section aria-label="Passo a passo" className="space-y-4">
        <h2 className="font-display text-lg font-bold text-white">Passo a passo</h2>
        <ol className="space-y-6">
          {article.steps.map((step, idx) => (
            <StepItem key={idx} step={step} index={idx} gallery={gallery} />
          ))}
        </ol>
      </section>

      {article.result && (
        <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-xs text-emerald-200 space-y-1">
          <p className="font-semibold text-emerald-300">✓ O que acontece depois?</p>
          <p className="leading-relaxed">{article.result}</p>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {article.tips.map((t, i) => (
          <NoticeBox key={i} type="tip" title="Dica útil" text={t} />
        ))}
        {article.warnings.map((w, i) => (
          <NoticeBox key={i} type="warning" title="Atenção" text={w} />
        ))}
      </div>

      {article.problems.length > 0 && (
        <section id="problemas" aria-label="Problemas comuns" className="scroll-mt-24 space-y-3 rounded-2xl border border-line bg-surface p-5">
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

      {article.faq.length > 0 && (
        <section id="faq" aria-label="Dúvidas frequentes" className="scroll-mt-24 space-y-3 rounded-2xl border border-line bg-surface p-5">
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

      <ArticleActions article={article} />

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

      <SupportCard compact />
    </article>
  );
}
