"use client";

import { BookA, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/form";
import { articles } from "@/help";
import { canReadArticle } from "@/help/access";
import { useHelp } from "@/help/components/context";
import { Breadcrumb } from "@/help/components/ui";
import { glossaryFor, statusGroups } from "@/help/glossary";
import { normalize } from "@/help/search";

export default function GlossaryPage() {
  const { access, base } = useHelp();
  const [q, setQ] = useState("");
  // Link só para artigo que o perfil pode abrir.
  const readable = useMemo(() => new Set(articles.filter((a) => canReadArticle(a, access)).map((a) => a.slug)), [access]);
  const terms = useMemo(() => {
    const t = normalize(q);
    return glossaryFor(access.audience)
      .filter((g) => !t || normalize(g.term + " " + g.definition).includes(t))
      .sort((a, b) => a.term.localeCompare(b.term, "pt-BR"));
  }, [q, access.audience]);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Ajuda", href: base }, { label: "Glossário" }]} />
      <header className="space-y-3 border-b border-line pb-4">
        <h1 className="font-display text-2xl font-bold text-white flex items-center gap-2">
          <BookA className="size-6 text-brand-soft" /> Glossário e status
        </h1>
        <p className="text-xs text-muted">Termos usados no sistema, explicados em linguagem simples.</p>
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar termos (ex.: caução, baixa, FIPE)..." className="pl-9 text-xs" aria-label="Filtrar glossário" />
        </div>
      </header>

      <dl className="divide-y divide-line rounded-2xl border border-line bg-surface p-4 sm:p-6">
        {terms.map((t) => (
          <div key={t.term} className="py-3 first:pt-0 last:pb-0">
            <dt className="font-semibold text-sm text-white">{t.term}</dt>
            <dd className="mt-1 text-xs text-zinc-300 leading-relaxed">
              {t.definition}{" "}
              {t.article && readable.has(t.article) && (
                <Link href={`${base}/artigo/${t.article}`} className="text-brand-soft hover:underline">Ver tutorial →</Link>
              )}
            </dd>
          </div>
        ))}
        {!terms.length && <p className="py-6 text-center text-xs text-muted">Nenhum termo encontrado.</p>}
      </dl>

      {access.audience === "admin" && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold text-white">O que significa cada status</h2>
          <p className="text-xs text-muted">Os nomes abaixo são exatamente os que aparecem nas telas.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {statusGroups.map((g) => (
              <div key={g.title} className="rounded-2xl border border-line bg-surface p-4 text-xs break-inside-avoid">
                <h3 className="font-semibold text-white">{g.title}</h3>
                <ul className="mt-2 space-y-1.5">
                  {g.items.map((i) => (
                    <li key={i.label}>
                      <span className="font-medium text-zinc-100">{i.label}</span>
                      {i.meaning && <span className="text-muted"> — {i.meaning}</span>}
                    </li>
                  ))}
                </ul>
                {g.article && readable.has(g.article) && (
                  <Link href={`${base}/artigo/${g.article}`} className="mt-2 inline-block text-brand-soft hover:underline">Ver tutorial →</Link>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
