"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { Clock } from "lucide-react";
import { useHelp } from "@/help/components/context";
import { Breadcrumb } from "@/help/components/ui";
import { articles, categoryName } from "@/help";
import { canReadArticle, featureAvailable } from "@/help/access";

export default function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { access, base } = useHelp();
  const title = categoryName(slug);

  const list = useMemo(
    () => articles.filter((a) => a.category === slug && canReadArticle(a, access) && featureAvailable(a, access)),
    [slug, access],
  );

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Ajuda", href: base }, { label: title }]} />

      <header className="border-b border-line pb-4">
        <h1 className="font-display text-2xl font-bold text-white">{title}</h1>
        <p className="mt-1 text-xs text-muted">{list.length} tutorial(is) disponível(is) nesta categoria.</p>
      </header>

      {!list.length ? (
        <p className="text-sm text-muted">Nenhum artigo disponível para o seu perfil nesta categoria.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((a) => (
            <Link
              key={a.slug}
              href={`${base}/artigo/${a.slug}`}
              className="rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-white/[0.04] space-y-2 block"
            >
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="font-medium text-brand-soft uppercase tracking-wider">{a.difficulty ?? "Guia"}</span>
                <span className="flex items-center gap-1"><Clock className="size-3" /> {a.minutes} min</span>
              </div>
              <h2 className="font-semibold text-sm text-white">{a.title}</h2>
              <p className="text-xs text-muted line-clamp-2">{a.description}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
