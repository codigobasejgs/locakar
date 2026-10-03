"use client";

import { FileText, Printer } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { articles, categoriesOf, helpVersion } from "@/help";
import { canReadArticle } from "@/help/access";
import { useHelp } from "@/help/components/context";
import { Breadcrumb } from "@/help/components/ui";
import { glossaryFor } from "@/help/glossary";

/**
 * Manual completo: todos os artigos que o perfil pode ler, agrupados por categoria.
 * "Salvar em PDF" usa a impressão do navegador com o CSS de impressão (sem menus nem botões),
 * então o PDF tem texto selecionável e screenshots, não uma foto da página.
 */
export default function ManualPage() {
  const { access, base, brand } = useHelp();
  const list = useMemo(() => articles.filter((a) => canReadArticle(a, access)), [access]);
  const chapters = useMemo(() => categoriesOf(list).map((c) => ({ ...c, items: list.filter((a) => a.category === c.slug) })), [list]);
  const terms = glossaryFor(access.audience);
  const title = access.audience === "tenant" ? "Guia completo do aplicativo" : "Manual completo do sistema";

  return (
    <div className="space-y-8 help-manual">
      <Breadcrumb items={[{ label: "Ajuda", href: base }, { label: title }]} />
      <header className="space-y-3 border-b border-line pb-5">
        <h1 className="font-display text-2xl font-bold text-white flex items-center gap-2">
          <FileText className="size-6 text-brand-soft" /> {title}
        </h1>
        <p className="text-xs text-muted">
          {brand ? `${brand} · ` : ""}{list.length} tutoriais · documentação {helpVersion.docsVersion} (sistema {helpVersion.appVersion}), revisada em {helpVersion.lastReviewedAt}.
        </p>
        <div className="no-print flex flex-wrap gap-2">
          <Button size="sm" onClick={() => window.print()}><Printer className="size-4" /> Imprimir ou salvar em PDF</Button>
        </div>
        <p className="no-print text-[11px] text-muted">Para PDF, escolha &quot;Salvar como PDF&quot; como impressora.</p>
      </header>

      <nav aria-label="Índice" className="rounded-2xl border border-line bg-surface p-5 text-sm break-after-page">
        <h2 className="font-display font-bold text-white">Índice</h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-zinc-300">
          {chapters.map((c) => (
            <li key={c.slug}>
              <a href={`#cap-${c.slug}`} className="hover:text-white">{c.title}</a>
              <span className="text-muted"> ({c.items.length})</span>
            </li>
          ))}
          <li><a href="#glossario" className="hover:text-white">Glossário</a></li>
        </ol>
      </nav>

      {chapters.map((c, ci) => (
        <section key={c.slug} id={`cap-${c.slug}`} className="scroll-mt-24 space-y-6">
          <h2 className="font-display text-xl font-bold text-white border-b border-line pb-2">{ci + 1}. {c.title}</h2>
          {c.items.map((a) => (
            <article key={a.slug} className="space-y-3 break-inside-avoid-page">
              <h3 className="font-display text-base font-semibold text-white">
                <Link href={`${base}/artigo/${a.slug}`} className="hover:text-brand-soft">{a.title}</Link>
              </h3>
              <p className="text-sm text-zinc-300">{a.description}</p>
              {a.prerequisites.length > 0 && <p className="text-xs text-muted"><strong className="text-zinc-200">Antes de começar:</strong> {a.prerequisites.join(" ")}</p>}
              <ol className="list-decimal space-y-3 pl-5 text-sm text-zinc-300">
                {a.steps.map((s, i) => (
                  <li key={i} className="break-inside-avoid">
                    <strong className="text-white">{s.title}.</strong> {s.text}
                    {s.fields && s.fields.length > 0 && (
                      <ul className="mt-1 list-disc pl-5 text-xs text-muted">
                        {s.fields.map((f) => <li key={f.name}><strong className="text-zinc-200">{f.name}{f.required ? " *" : ""}:</strong> {f.description}{f.example ? ` Ex.: ${f.example}` : ""}</li>)}
                      </ul>
                    )}
                    {s.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.image} alt={s.caption ?? s.title} loading="lazy" className="mt-2 max-h-72 w-auto max-w-full rounded-lg border border-line" />
                    )}
                  </li>
                ))}
              </ol>
              {a.result && <p className="text-xs text-emerald-300"><strong>O que acontece depois:</strong> {a.result}</p>}
              {a.warnings.map((w, i) => <p key={i} className="text-xs text-amber-300"><strong>Atenção:</strong> {w}</p>)}
              {a.problems.length > 0 && (
                <div className="text-xs text-zinc-300">
                  <p className="font-semibold text-white">Problemas comuns</p>
                  <ul className="mt-1 list-disc pl-5 space-y-1">{a.problems.map((p, i) => <li key={i}><strong>{p.question}</strong> {p.answer}</li>)}</ul>
                </div>
              )}
            </article>
          ))}
        </section>
      ))}

      <section id="glossario" className="scroll-mt-24 space-y-3">
        <h2 className="font-display text-xl font-bold text-white border-b border-line pb-2">Glossário</h2>
        <dl className="grid gap-2 text-xs sm:grid-cols-2">
          {terms.map((t) => (
            <div key={t.term} className="break-inside-avoid">
              <dt className="font-semibold text-white">{t.term}</dt>
              <dd className="text-zinc-300">{t.definition}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
