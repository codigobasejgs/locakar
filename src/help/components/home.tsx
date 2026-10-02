"use client";

import { AlertCircle, BookOpen, Clock, HelpCircle, Layers, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { useHelp } from "@/help/components/context";
import { articles, categoriesOf, trainingsOf } from "@/help";
import { canReadArticle, featureAvailable } from "@/help/access";
import { searchArticles } from "@/help/search";

export default function HelpHomePage() {
  const { access, base, progress } = useHelp();
  const [query, setQuery] = useState("");

  const visible = useMemo(() => articles.filter((a) => canReadArticle(a, access) && featureAvailable(a, access)), [access]);
  const categories = useMemo(() => categoriesOf(visible), [visible]);
  const searchResults = useMemo(() => query.trim() ? searchArticles(visible, query) : [], [visible, query]);

  const trainings = useMemo(() => trainingsOf(visible).slice(0, 6), [visible]);
  const completedCount = progress.completed.length;

  return (
    <div className="space-y-8">
      {/* Header com busca grande */}
      <section className="rounded-3xl border border-line bg-gradient-to-br from-panel via-surface to-panel p-6 sm:p-10 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-magenta/40 bg-magenta/15 px-3 py-1 text-xs font-semibold text-brand-soft">
          <Sparkles className="size-3.5" /> Central de Ajuda e Treinamento
        </span>
        <h1 className="mt-3 font-display text-2xl font-bold text-white sm:text-4xl">
          Como podemos ajudar você hoje?
        </h1>
        <p className="mt-2 text-xs text-muted sm:text-sm max-w-xl mx-auto">
          Encontre tutoriais passo a passo, explicação de campos, resolução de problemas e aprenda a operar o sistema.
        </p>

        <div className="mt-6 max-w-2xl mx-auto relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquise sua dúvida (ex.: como cadastrar veículo, cobrar PIX, contrato)..."
            className="h-14 pl-12 pr-4 text-base rounded-2xl bg-surface border-line-strong shadow-lg focus-visible:border-brand-soft"
            aria-label="Pesquisar na Central de Ajuda"
          />
        </div>
      </section>

      {/* Resultados da Busca em tempo real */}
      {query.trim() && (
        <section aria-label="Resultados da pesquisa" className="space-y-4">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <h2 className="font-display text-sm font-semibold text-white">
              Resultados para &quot;{query}&quot; ({searchResults.length})
            </h2>
            <Button size="sm" variant="ghost" onClick={() => setQuery("")}>Limpar busca</Button>
          </div>

          {!searchResults.length ? (
            <Card className="p-8 text-center space-y-3">
              <AlertCircle className="size-8 text-amber-400 mx-auto" />
              <p className="font-semibold text-white">Não encontramos uma resposta exata.</p>
              <p className="text-xs text-muted max-w-md mx-auto">
                Tente outras palavras (ex.: carro, aluguel, recebimento), navegue pelas categorias abaixo ou confira o FAQ da locadora.
              </p>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {searchResults.map(({ article }) => (
                <Link
                  key={article.slug}
                  href={`${base}/artigo/${article.slug}`}
                  className="rounded-2xl border border-line bg-surface p-4 transition-all hover:border-line-strong hover:bg-white/[0.03] space-y-2 block"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-brand-soft uppercase tracking-wider">{article.category}</span>
                    <span className="text-[11px] text-muted flex items-center gap-1"><Clock className="size-3" /> {article.minutes} min</span>
                  </div>
                  <h3 className="font-semibold text-sm text-white">{article.title}</h3>
                  <p className="text-xs text-muted line-clamp-2">{article.description}</p>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Comece por aqui */}
      {!query.trim() && (
        <>
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                  <BookOpen className="size-5 text-brand-soft" /> Comece por aqui
                </h2>
                <p className="text-xs text-muted">Tutoriais essenciais para dominar a operação da locadora.</p>
              </div>
              {completedCount > 0 && (
                <span className="text-xs text-emerald-400 font-medium">
                  {completedCount} tutorial(is) concluído(s) ✓
                </span>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visible.slice(0, 6).map((art) => (
                <Link
                  key={art.slug}
                  href={`${base}/artigo/${art.slug}`}
                  className="group rounded-2xl border border-line bg-surface p-4 transition-all hover:border-line-strong hover:bg-white/[0.04] space-y-2 flex flex-col justify-between"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone={art.difficulty === "Iniciante" ? "success" : "brand"}>{art.difficulty ?? "Guia"}</Badge>
                      <span className="text-[11px] text-muted flex items-center gap-1"><Clock className="size-3" /> {art.minutes} min</span>
                    </div>
                    <h3 className="font-semibold text-sm text-white group-hover:text-brand-soft transition-colors">{art.title}</h3>
                    <p className="text-xs text-muted line-clamp-2">{art.description}</p>
                  </div>
                  <span className="text-xs font-semibold text-brand-soft flex items-center gap-1 pt-2">
                    Acessar tutorial ↗
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {/* Trilhas e Treinamentos */}
          <section className="space-y-4">
            <div className="flex items-center justify-between border-t border-line pt-6">
              <div>
                <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                  <Layers className="size-5 text-brand-soft" /> Trilhas de Treinamento
                </h2>
                <p className="text-xs text-muted">Cursos estruturados para capacitação rápida de donos e funcionários.</p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={`${base}/treinamentos`}>Ver todas as trilhas</Link>
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {trainings.map((t) => (
                <Link
                  key={t.slug}
                  href={`${base}/treinamentos/${t.slug}`}
                  className="rounded-2xl border border-line bg-surface p-4 transition-all hover:border-line-strong hover:bg-white/[0.04] space-y-2 block"
                >
                  <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">{t.lessons.length} aulas</span>
                  <h3 className="font-semibold text-sm text-white">{t.title}</h3>
                  <p className="text-xs text-muted line-clamp-2">{t.description}</p>
                </Link>
              ))}
            </div>
          </section>

          {/* Categorias */}
          <section className="space-y-4 border-t border-line pt-6">
            <h2 className="font-display text-lg font-bold text-white">Navegar por Categorias</h2>
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

          {/* Dúvidas Frequentes (FAQ) */}
          <section className="rounded-2xl border border-line bg-surface p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-white flex items-center gap-2">
                <HelpCircle className="size-4 text-brand-soft" /> Perguntas e Dúvidas Frequentes (FAQ)
              </h3>
              <p className="mt-1 text-xs text-muted">Consulte respostas diretas sobre contratos, pagamentos, vistorias e frota.</p>
            </div>
            <Button asChild size="sm">
              <Link href={`${base}/faq`}>Acessar FAQ completo</Link>
            </Button>
          </section>
        </>
      )}
    </div>
  );
}
