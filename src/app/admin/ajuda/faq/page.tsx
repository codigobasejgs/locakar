"use client";

import { HelpCircle, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/form";
import { useHelp } from "@/help/components/context";
import { Breadcrumb } from "@/help/components/ui";
import { articles } from "@/help";
import { canReadArticle, featureAvailable } from "@/help/access";
import { normalize } from "@/help/search";

export default function FAQPage() {
  const { access, base } = useHelp();
  const [q, setQ] = useState("");

  const visible = useMemo(() => articles.filter((a) => canReadArticle(a, access) && featureAvailable(a, access)), [access]);

  const allFaq = useMemo(() => {
    const list: { question: string; answer: string; article: { slug: string; title: string; category: string } }[] = [];
    for (const a of visible) {
      for (const item of a.faq) list.push({ ...item, article: { slug: a.slug, title: a.title, category: a.category } });
      for (const item of a.problems) list.push({ question: item.question, answer: item.answer, article: { slug: a.slug, title: a.title, category: a.category } });
    }
    return list;
  }, [visible]);

  const filtered = useMemo(() => {
    const term = normalize(q);
    if (!term) return allFaq;
    return allFaq.filter((f) => normalize(f.question + " " + f.answer).includes(term));
  }, [allFaq, q]);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Ajuda", href: base }, { label: "Perguntas Frequentes (FAQ)" }]} />

      <header className="space-y-3 border-b border-line pb-4">
        <h1 className="font-display text-2xl font-bold text-white flex items-center gap-2">
          <HelpCircle className="size-6 text-brand-soft" /> Perguntas e Dúvidas Frequentes (FAQ)
        </h1>
        <p className="text-xs text-muted">Consulte respostas diretas sobre contratos, pagamentos, vistorias e operação.</p>

        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filtrar perguntas (ex.: placa, comprovante, pix, contrato)..."
            className="pl-9 text-xs"
            aria-label="Filtrar perguntas frequentes"
          />
        </div>
      </header>

      <div className="divide-y divide-line rounded-2xl border border-line bg-surface p-4 sm:p-6 space-y-4">
        {filtered.map((item, i) => (
          <div key={i} className="pt-4 first:pt-0 space-y-1.5">
            <h2 className="font-semibold text-sm text-white">❓ {item.question}</h2>
            <p className="text-xs text-zinc-300 leading-relaxed">{item.answer}</p>
            <div className="pt-1">
              <Link href={`${base}/artigo/${item.article.slug}`} className="text-[11px] font-semibold text-brand-soft hover:underline">
                Ver tutorial completo: {item.article.title} →
              </Link>
            </div>
          </div>
        ))}
        {!filtered.length && <p className="py-8 text-center text-xs text-muted">Nenhuma dúvida encontrada para este filtro.</p>}
      </div>
    </div>
  );
}
