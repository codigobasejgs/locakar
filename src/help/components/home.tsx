"use client";

import { AlertCircle, BookA, BookOpen, Clock, FileText, HelpCircle, Layers, PlayCircle, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { HelpAssistant } from "@/help/components/assistant";
import { useHelp } from "@/help/components/context";
import { SupportCard } from "@/help/components/ui";
import { articles, categoriesOf, categoryName, trainingsOf } from "@/help";
import { canReadArticle, featureAvailable } from "@/help/access";
import { glossaryFor } from "@/help/glossary";
import { normalize, searchArticles } from "@/help/search";
import { trackHelp } from "@/help/track";

// Ordem dos acessos rápidos; só aparecem as categorias que o perfil enxerga.
const QUICK = ["primeiros-passos", "veiculos", "clientes", "reservas", "locacoes", "pagamentos", "contratos", "financeiro", "configuracoes", "empresa", "integracoes", "locatario"];

export default function HelpHomePage() {
  const { access, base, brand, progress, setProgress } = useHelp();
  const [query, setQuery] = useState("");

  const visible = useMemo(() => articles.filter((a) => canReadArticle(a, access) && featureAvailable(a, access)), [access]);
  const categories = useMemo(() => categoriesOf(visible), [visible]);
  const searchResults = useMemo(() => (query.trim() ? searchArticles(visible, query) : []), [visible, query]);
  const terms = useMemo(() => {
    const q = normalize(query);
    return q.length < 3 ? [] : glossaryFor(access.audience).filter((t) => normalize(t.term).includes(q) || q.includes(normalize(t.term)));
  }, [query, access.audience]);
  const trainings = useMemo(() => trainingsOf(visible), [visible]);
  const quick = useMemo(() => QUICK.map((s) => categories.find((c) => c.slug === s)).filter((c): c is NonNullable<typeof c> => Boolean(c)), [categories]);
  const starters = useMemo(() => {
    const first = visible.filter((a) => a.category === "primeiros-passos" || a.audience === "tenant");
    return (first.length ? first : visible).slice(0, 6);
  }, [visible]);

  // Treinamento em andamento: último artigo aberto que ainda não foi concluído.
  const { recent, completed, lessonSteps } = progress;
  const resume = useMemo(() => {
    const slug = recent.find((s) => !completed.includes(s) && visible.some((x) => x.slug === s));
    const a = slug ? visible.find((x) => x.slug === slug) : undefined;
    return a ? { article: a, step: Math.min(lessonSteps[a.slug] ?? 1, a.steps.length) } : null;
  }, [recent, completed, lessonSteps, visible]);

  const done = visible.filter((a) => progress.completed.includes(a.slug)).length;
  const pct = visible.length ? Math.round((done / visible.length) * 100) : 0;

  // Registra a busca quando o usuário para de digitar (no aparelho e, sem dados pessoais, no servidor).
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 3) return;
    const t = setTimeout(() => {
      const results = searchResults.length;
      setProgress((p) => ({ ...p, searches: [...p.searches.filter((s) => s.query !== q), { query: q, count: results }].slice(-50) }));
      trackHelp(access.audience, { kind: "search", query: q, results });
    }, 1200);
    return () => clearTimeout(t);
  }, [query, searchResults.length, access.audience, setProgress]);

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-line bg-gradient-to-br from-panel via-surface to-panel p-6 sm:p-10 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-magenta/40 bg-magenta/15 px-3 py-1 text-xs font-semibold text-brand-soft">
          <Sparkles className="size-3.5" /> {access.audience === "tenant" ? `Guia do aplicativo${brand ? ` · ${brand}` : ""}` : "Central de Ajuda e Treinamento"}
        </span>
        <h1 className="mt-3 font-display text-2xl font-bold text-white sm:text-4xl">Como podemos ajudar?</h1>
        <p className="mt-2 text-xs text-muted sm:text-sm max-w-xl mx-auto">
          Tutoriais passo a passo com as telas reais do sistema, explicação de cada campo e solução de problemas.
        </p>

        <div className="mt-6 max-w-2xl mx-auto relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={access.audience === "tenant" ? "Ex.: como pagar com PIX?" : "Ex.: como cadastrar um veículo?"}
            className="h-14 pl-12 pr-4 text-base rounded-2xl bg-surface border-line-strong shadow-lg focus-visible:border-brand-soft"
            aria-label="Pesquisar na Central de Ajuda"
          />
        </div>
        {access.audience === "admin" && (
          <p className="no-print mt-2 hidden text-[11px] text-muted sm:block">
            Dica: em qualquer tela do painel, pressione <kbd className="rounded border border-line px-1">Ctrl</kbd> + <kbd className="rounded border border-line px-1">K</kbd> para pesquisar a ajuda.
          </p>
        )}
      </section>

      {query.trim() && (
        <section aria-label="Resultados da pesquisa" aria-live="polite" className="space-y-4">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <h2 className="font-display text-sm font-semibold text-white">
              Resultados para &quot;{query}&quot; ({searchResults.length})
            </h2>
            <Button size="sm" variant="ghost" onClick={() => setQuery("")}>Limpar busca</Button>
          </div>

          {terms.length > 0 && (
            <div className="rounded-2xl border border-line bg-surface p-4 text-xs space-y-2">
              {terms.slice(0, 2).map((t) => (
                <p key={t.term}>
                  <span className="font-semibold text-white">{t.term}:</span> <span className="text-zinc-300">{t.definition}</span>
                </p>
              ))}
            </div>
          )}

          {!searchResults.length ? (
            <Card className="p-8 text-center space-y-4">
              <AlertCircle className="size-8 text-amber-400 mx-auto" />
              <p className="font-semibold text-white">Não encontramos uma resposta para essa dúvida.</p>
              <p className="text-xs text-muted max-w-md mx-auto">
                Tente outras palavras (ex.: carro, aluguel, cobrança), veja um dos tutoriais abaixo ou fale com o suporte.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {starters.slice(0, 4).map((a) => (
                  <Button key={a.slug} asChild size="sm" variant="outline">
                    <Link href={`${base}/artigo/${a.slug}`}>{a.title}</Link>
                  </Button>
                ))}
              </div>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {searchResults.slice(0, 12).map(({ article }) => (
                <Link
                  key={article.slug}
                  href={`${base}/artigo/${article.slug}`}
                  className="rounded-2xl border border-line bg-surface p-4 transition-all hover:border-line-strong hover:bg-white/[0.03] space-y-2 block"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-brand-soft uppercase tracking-wider">{categoryName(article.category)}</span>
                    <span className="text-[11px] text-muted flex items-center gap-1"><Clock className="size-3" /> {article.minutes} min · {article.difficulty ?? "Guia"}</span>
                  </div>
                  <h3 className="font-semibold text-sm text-white">{article.title}</h3>
                  <p className="text-xs text-muted line-clamp-2">{article.description}</p>
                </Link>
              ))}
            </div>
          )}
          <SupportCard compact />
        </section>
      )}

      {!query.trim() && (
        <>
          {resume && (
            <section className="rounded-2xl border border-magenta/30 bg-magenta/5 p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-soft">Continue seu treinamento</p>
                <h2 className="mt-1 font-semibold text-white truncate">{resume.article.title}</h2>
                <p className="text-xs text-muted">Passo {resume.step} de {resume.article.steps.length}</p>
              </div>
              <Button asChild size="sm">
                <Link href={`${base}/artigo/${resume.article.slug}#passo-${resume.step}`}>
                  <PlayCircle className="size-4" /> Continuar
                </Link>
              </Button>
            </section>
          )}

          <HelpAssistant />

          {quick.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display text-lg font-bold text-white">Acessos rápidos</h2>
              <div className="flex flex-wrap gap-2">
                {quick.map((c) => (
                  <Link key={c.slug} href={`${base}/categoria/${c.slug}`} className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-zinc-200 transition-colors hover:border-line-strong hover:text-white">
                    {c.title}
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                  <BookOpen className="size-5 text-brand-soft" /> Comece por aqui
                </h2>
                <p className="text-xs text-muted">Tutoriais essenciais para começar a usar.</p>
              </div>
              {visible.length > 0 && (
                <div className="min-w-48">
                  <div className="flex justify-between text-[11px] text-muted">
                    <span>Seu progresso</span>
                    <span>{done}/{visible.length} · {pct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Tutoriais concluídos">
                    <div className="h-full bg-gradient-to-r from-magenta to-brand" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {starters.map((art) => (
                <Link
                  key={art.slug}
                  href={`${base}/artigo/${art.slug}`}
                  className="group rounded-2xl border border-line bg-surface p-4 transition-all hover:border-line-strong hover:bg-white/[0.04] space-y-2 flex flex-col justify-between"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone={progress.completed.includes(art.slug) ? "success" : art.difficulty === "Iniciante" ? "info" : "brand"}>
                        {progress.completed.includes(art.slug) ? "Concluído ✓" : art.difficulty ?? "Guia"}
                      </Badge>
                      <span className="text-[11px] text-muted flex items-center gap-1"><Clock className="size-3" /> {art.minutes} min</span>
                    </div>
                    <h3 className="font-semibold text-sm text-white group-hover:text-brand-soft transition-colors">{art.title}</h3>
                    <p className="text-xs text-muted line-clamp-2">{art.description}</p>
                  </div>
                  <span className="text-xs font-semibold text-brand-soft pt-2">Acessar tutorial ↗</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="space-y-4 border-t border-line pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                  <Layers className="size-5 text-brand-soft" /> Treinamentos
                </h2>
                <p className="text-xs text-muted">Trilhas com os tutoriais em sequência.</p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={`${base}/treinamentos`}>Ver todos</Link>
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {trainings.slice(0, 6).map((t) => {
                const d = t.lessons.filter((l) => progress.completed.includes(l.slug)).length;
                return (
                  <Link key={t.slug} href={`${base}/treinamentos/${t.slug}`} className="rounded-2xl border border-line bg-surface p-4 transition-all hover:border-line-strong hover:bg-white/[0.04] space-y-2 block">
                    <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">{d}/{t.lessons.length} aulas</span>
                    <h3 className="font-semibold text-sm text-white">{t.title}</h3>
                    <p className="text-xs text-muted line-clamp-2">{t.description}</p>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="space-y-4 border-t border-line pt-6">
            <h2 className="font-display text-lg font-bold text-white">Todas as categorias</h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {categories.map((c) => (
                <Link
                  key={c.slug}
                  href={`${base}/categoria/${c.slug}`}
                  className="rounded-xl border border-line bg-surface p-3 text-xs transition-colors hover:border-line-strong hover:bg-white/[0.04] flex items-center justify-between"
                >
                  <span className="font-medium text-white truncate">{c.title}</span>
                  <span className="text-[11px] text-muted ml-2">{c.count}</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            {[
              { href: `${base}/faq`, icon: HelpCircle, title: "Dúvidas frequentes", text: "Perguntas e problemas comuns com resposta curta." },
              { href: `${base}/glossario`, icon: BookA, title: "Glossário e status", text: "O que significa cada termo e cada situação." },
              { href: `${base}/manual`, icon: FileText, title: "Manual completo", text: "Todos os tutoriais em uma página, pronto para imprimir ou salvar em PDF." },
            ].map((c) => (
              <Link key={c.href} href={c.href} className="rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-line-strong hover:bg-white/[0.04] block">
                <c.icon className="size-5 text-brand-soft" />
                <h3 className="mt-2 font-semibold text-white">{c.title}</h3>
                <p className="mt-1 text-xs text-muted">{c.text}</p>
              </Link>
            ))}
          </section>

          <SupportCard />
        </>
      )}
    </div>
  );
}
